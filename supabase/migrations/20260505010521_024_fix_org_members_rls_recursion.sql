/*
  # Fix infinite recursion in org_members RLS policies

  ## Problem
  Several org_members SELECT policies check org_members from within an org_members policy,
  causing infinite recursion (e.g. "Org owners can view their org members" queries org_members
  to verify the caller is an owner, which triggers the same SELECT policy again).

  ## Fix
  1. Create a SECURITY DEFINER helper function that bypasses RLS to check org ownership.
  2. Drop the recursive policies and replace them with non-recursive equivalents.
  3. Also fix the "Org owners can insert" policy which had a bug (om2.org_id = om2.org_id).
*/

-- Helper: check if current user is an owner of a given org (bypasses RLS)
CREATE OR REPLACE FUNCTION is_org_owner(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = p_org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$;

-- Drop the recursive / buggy policies
DROP POLICY IF EXISTS "Org owners can view their org members" ON org_members;
DROP POLICY IF EXISTS "Org owners can insert members into their org" ON org_members;
DROP POLICY IF EXISTS "Org owners can delete members from their org" ON org_members;

-- Re-create using the SECURITY DEFINER helper (no recursion)
CREATE POLICY "Org owners can view their org members"
  ON org_members FOR SELECT
  TO authenticated
  USING (is_org_owner(org_id));

CREATE POLICY "Org owners can insert members into their org"
  ON org_members FOR INSERT
  TO authenticated
  WITH CHECK (is_org_owner(org_id));

CREATE POLICY "Org owners can delete members from their org"
  ON org_members FOR DELETE
  TO authenticated
  USING (is_org_owner(org_id));
