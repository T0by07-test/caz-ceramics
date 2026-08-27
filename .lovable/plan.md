# Set up branded email for reservas.cazuceramics.com in IONOS

## Goal
Configure the DNS records needed so Lovable can send emails as `Cazú Ceramics <noreply@notify.reservas.cazuceramics.com>` (e.g. booking confirmations, password resets) using the existing IONOS-managed domain.

## Current state
- Custom web domain `reservas.cazuceramics.com` is already active.
- Email domain status: **Pending** — DNS records for `notify.reservas.cazuceramics.com` have not been added yet.

## Exact DNS records to add in IONOS

### 1. TXT verification record
| Type | Host / Name | Value |
|------|-------------|-------|
| TXT | `_lovable-email.reservas.cazuceramics.com` | `lovable_email_verify=ab2edf9bcb073a1c19f0940891c23c2c9ab63df5021a60cad8f14dca8c526e12` |

### 2. NS delegation for the email subdomain
| Type | Host / Name | Value |
|------|-------------|-------|
| NS | `notify.reservas.cazuceramics.com` | `ns5.lovable.cloud` |
| NS | `notify.reservas.cazuceramics.com` | `ns6.lovable.cloud` |

## Step-by-step in IONOS

1. Log in to **IONOS** and go to **Domains & Hosting**.
2. Find `cazuceramics.com` (or `reservas.cazuceramics.com`) and open **DNS** settings.
3. Click **Add record**.
4. Add the **TXT** record:
   - Type: `TXT`
   - Host / Name: `_lovable-email.reservas.cazuceramics.com`
   - Value: `lovable_email_verify=ab2edf9bcb073a1c19f0940891c23c2c9ab63df5021a60cad8f14dca8c526e12`
   - TTL: leave default (or 3600)
5. Add the first **NS** record:
   - Type: `NS`
   - Host / Name: `notify.reservas.cazuceramics.com`
   - Value: `ns5.lovable.cloud`
   - TTL: leave default
6. Add the second **NS** record:
   - Type: `NS`
   - Host / Name: `notify.reservas.cazuceramics.com`
   - Value: `ns6.lovable.cloud`
   - TTL: leave default
7. **Save** the changes.

## Important notes

- Do **not** delete the existing A / TXT records that already point `reservas.cazuceramics.com` to Lovable. Only add the two new records above.
- If IONOS shows an error adding NS records for a subdomain, use the **Subdomain** section and set the subdomain `notify` to type `NS` pointing to `ns5.lovable.cloud` and `ns6.lovable.cloud`.
- DNS changes can take a few minutes to 48 hours to propagate. IONOS usually applies them within a few minutes.

## Next step

Once the records are saved, come back here and I’ll run the domain check to confirm verification and then wire the Spanish email templates so students receive confirmations signed as **Cazú Ceramics**.