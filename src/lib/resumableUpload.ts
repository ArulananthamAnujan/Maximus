const CHUNK_SIZE = 6 * 1024 * 1024;

export interface UploadProgressEvent {
  bytesUploaded: number;
  bytesTotal: number;
}

export interface ResumableUploadOptions {
  file: File;
  bucket: string;
  objectName: string;
  accessToken: string;
  supabaseUrl: string;
  onProgress?: (event: UploadProgressEvent) => void;
  signal?: AbortSignal;
}

async function tusUpload(opts: ResumableUploadOptions): Promise<string> {
  const { file, bucket, objectName, accessToken, supabaseUrl, onProgress, signal } = opts;
  const endpoint = `${supabaseUrl}/storage/v1/upload/resumable`;

  const createRes = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Upload-Length': String(file.size),
      'Upload-Metadata': [
        `bucketName ${btoa(bucket)}`,
        `objectName ${btoa(objectName)}`,
        `contentType ${btoa(file.type || 'application/octet-stream')}`,
        `cacheControl ${btoa('3600')}`,
      ].join(','),
      'Tus-Resumable': '1.0.0',
      'x-upsert': 'true',
    },
    signal,
  });

  if (!createRes.ok) {
    const body = await createRes.text().catch(() => '');
    let message = `TUS_FAILED:${createRes.status}`;
    try {
      const json = JSON.parse(body);
      message = `TUS_FAILED:${createRes.status}:${json.message || json.error || body}`;
    } catch {
      if (body) message = `TUS_FAILED:${createRes.status}:${body}`;
    }
    throw new Error(message);
  }

  const uploadUrl = createRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL returned from server');

  const resolvedUrl = uploadUrl.startsWith('http') ? uploadUrl : `${supabaseUrl}${uploadUrl}`;

  let offset = 0;
  while (offset < file.size) {
    if (signal?.aborted) throw new DOMException('Upload aborted', 'AbortError');

    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const patchRes = await fetch(resolvedUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/offset+octet-stream',
        'Upload-Offset': String(offset),
        'Tus-Resumable': '1.0.0',
      },
      body: chunk,
      signal,
    });

    if (!patchRes.ok) {
      const body = await patchRes.text().catch(() => '');
      let message = `Chunk upload failed at offset ${offset} (${patchRes.status})`;
      try {
        const json = JSON.parse(body);
        message = json.message || json.error || body || message;
      } catch {
        if (body) message = body;
      }
      throw new Error(message);
    }

    const newOffset = patchRes.headers.get('Upload-Offset');
    offset = newOffset ? parseInt(newOffset, 10) : offset + chunk.size;

    onProgress?.({ bytesUploaded: offset, bytesTotal: file.size });
  }

  return objectName;
}

async function standardUpload(opts: ResumableUploadOptions): Promise<string> {
  const { file, bucket, objectName, accessToken, supabaseUrl, onProgress, signal } = opts;
  const endpoint = `${supabaseUrl}/storage/v1/object/${bucket}/${objectName}`;

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', endpoint);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.setRequestHeader('Cache-Control', '3600');

    if (signal) {
      signal.addEventListener('abort', () => {
        xhr.abort();
        reject(new DOMException('Upload aborted', 'AbortError'));
      });
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress?.({ bytesUploaded: e.loaded, bytesTotal: e.total });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(objectName);
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          const json = JSON.parse(xhr.responseText);
          message = json.message || json.error || message;
        } catch {
          if (xhr.responseText) message = xhr.responseText;
        }
        reject(new Error(message));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));

    const formData = new FormData();
    formData.append('', file, file.name);
    xhr.send(formData);
  });
}

export async function resumableUpload(opts: ResumableUploadOptions): Promise<string> {
  try {
    return await tusUpload(opts);
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;

    const msg = err instanceof Error ? err.message : '';
    const isTusFailed = msg.startsWith('TUS_FAILED:');

    if (isTusFailed) {
      return standardUpload(opts);
    }

    throw err;
  }
}
