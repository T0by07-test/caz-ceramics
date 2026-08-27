# Send emails from @cazuceramics.com (IONOS DNS setup)

## Goal
Send all app emails (booking confirmations, password resets, reminders) from the root domain — e.g. `Cazú Ceramics <noreply@notify.cazuceramics.com>` — instead of the `reservas.cazuceramics.com` subdomain.

## Current state
- Web domain `reservas.cazuceramics.com` is active and serving the published app.
- An email domain was started for `reservas.cazuceramics.com` but never verified (still pending, no DNS added).
- `cazuceramics.com` is **not yet registered** as an email domain in this workspace, so its DNS records don't exist yet.

## Steps

### 1. Add cazuceramics.com as the sender domain
Open the email setup dialog and enter `cazuceramics.com`. This generates the domain-specific DNS records (a TXT verification value and two `nsX.lovable.cloud` nameservers for the `notify.cazuceramics.com` subdomain). These values are unique per domain — the ones previously issued for `reservas.cazuceramics.com` cannot be reused.

### 2. Add the records in IONOS
1. Log in to IONOS → **Domains & Hosting** → `cazuceramics.com` → **DNS**.
2. Add the **TXT** record shown in the dialog:
   - Host / Name: `_lovable-email` (IONOS appends the domain automatically)
   - Value: the `lovable_email_verify=...` string from the dialog
3. Add both **NS** records shown in the dialog:
   - Host / Name: `notify`
   - Values: the two `nsX.lovable.cloud` nameservers
4. Save. If IONOS refuses NS records in the main DNS table, create the subdomain `notify` first, then set its NS records.

Important: do **not** touch the existing records for `reservas.cazuceramics.com`, the website MX/mail records, or any SPF record already used for your normal mailbox. Only add the new ones.

### 3. Verify and switch the app over
Once DNS has propagated (usually minutes, up to 48h), I re-check verification and then:
- Point the notification sender to the new domain (`EMAIL_FROM` = `Cazú Ceramics <noreply@notify.cazuceramics.com>`), replacing the current `noreply@cazuceramics.com` default in the notification function.
- Set the auth email sender (signup confirmation, password recovery) to the same address so nothing arrives from `no-reply@auth.lovable.cloud` anymore.
- Translate the auth email templates to Spanish, signed as Cazú Ceramics.
- Send a real test confirmation email so you can review it before launch.

### 4. Optional cleanup
Remove the unused, never-verified `reservas.cazuceramics.com` email domain so only one sender domain remains.

## Technical notes
- Emails are sent from the `notify.` subdomain by design (delegated to Lovable nameservers). This keeps your normal IONOS mailbox on `@cazuceramics.com` fully intact — no risk to existing mail.
- Reply-to can still be a human address (e.g. your IONOS mailbox) if you want replies to reach you; I can configure that in the same pass.