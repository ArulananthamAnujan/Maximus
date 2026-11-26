# Maximus

Learning management system: React + Vite frontend, Supabase (Postgres, Auth, Storage,
Edge Functions), Stripe for payments.

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-xmupcckf)

## Running locally

1. Copy `.env.example` to `.env` and fill in the Supabase URL and anon key.
2. `npm install`, then `npm run dev`.
3. Checks: `npm run typecheck`, `npm run lint`, `npm run build`.

## Deploying a change

Deploy in this order so nothing breaks in between:

1. **Frontend** (it works against both the old and new database).
2. **Database migrations** in `supabase/migrations`, in filename order.
3. **Edge functions** in `supabase/functions`.

### Edge function secrets

Set these in Supabase Dashboard → Edge Functions → Secrets.

| Secret | Used for |
| --- | --- |
| `SITE_URL` | Links in emails and Stripe return pages, e.g. `https://yourdomain.com` |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Course, student-token and teacher-token payments |
| `ANTHROPIC_API_KEY` | AI course tools, student study tools, exam marking |
| `RESEND_API_KEY`, `EMAIL_FROM` | Welcome, enrolment and admin-message emails ([resend.com](https://resend.com)); `EMAIL_FROM` must be a sender on a domain verified in Resend. Without these, no email is sent. |

In Stripe, point a webhook for `checkout.session.completed` at
`<SUPABASE_URL>/functions/v1/stripe-webhook`.

In Supabase Auth → URL configuration, add `<SITE_URL>/reset-password` to the allowed
redirect URLs so password-reset emails land on the reset page.

### About the migration files

Files dated before `20260423072024` are an earlier schema that the later files replace;
the two sets cannot be applied to the same empty database. To build a new database from
scratch, apply only `20260423072024_001_…` onwards. Those apply cleanly in order.

`008_demo_users` and `045_…create_co_admin` create demo accounts with passwords that are
written in the files. On any real project, change those passwords (or delete the
accounts) straight after applying them.

## Admin settings to fill in

- **Settings → ABN**: printed on certificates; left off when blank.
- **Settings → Logo**: used on the site and on certificates.
- **Promo Codes**: percentage discounts, enforced at checkout.
