# PayFast ITN local QA

Run these cases against the local Hono API. Do not call PayFast's sandbox or live hosts. Do not set `PAYFAST_ITN_LOCAL` or `PAYFAST_VALIDATE_STUB` on Vercel or any shared host.

The IP check uses one platform-set address. `X-Forwarded-For`, `Forwarded`, `X-Client-IP`, `True-Client-IP`, `CF-Connecting-IP`, and `X-Original-Forwarded-For` are ignored even when they contain an allow-listed PayFast IP (`197.97.145.140` below).

## 1. Start the API so a normal request cannot choose the IP

Pick a secret the ITN caller must present. A request without it is rejected, including one that sets `x-real-ip` or `X-Forwarded-For` to a PayFast IP.

```bash
export PAYFAST_MERCHANT_ID='your-sandbox-merchant-id'
export PAYFAST_MERCHANT_KEY='your-sandbox-merchant-key'
export PAYFAST_PASSPHRASE='your-sandbox-passphrase'
export PAYFAST_MODE=sandbox
export PAYFAST_ITN_LOCAL=1
export PAYFAST_ITN_PLATFORM_SECRET="$(openssl rand -hex 16)"
export PAYFAST_VALIDATE_STUB=1
export AUTH_SECRET="$(openssl rand -hex 32)"
export DATABASE_URL='postgresql://YOUR_USER@127.0.0.1:5432/propertyflow'
npm run dev:api
```

`PAYFAST_VALIDATE_STUB=1` skips the network. The API reads the result from `X-PF-Validate-Stub` (`VALID`, `INVALID`, or `ERROR`) only when `X-PF-Platform-Secret` matches `PAYFAST_ITN_PLATFORM_SECRET`. Any other stub value is `INVALID`. A missing or wrong secret fails the postback and does not call PayFast.

The platform address is `X-PF-Platform-IP` on that same secret. `PAYFAST_ITN_PLATFORM_IP` is an optional fixed address from the server environment for requests that do not present the secret. Leave it unset for the cases below.

| Env | Purpose |
| --- | --- |
| `PAYFAST_ITN_LOCAL=1` | Turn on the QA harness. Off in production. |
| `PAYFAST_ITN_PLATFORM_SECRET` | Shared secret. Not a request the caller can invent. |
| `PAYFAST_ITN_PLATFORM_IP` | Optional fixed platform address. A request cannot change it. |
| `PAYFAST_ITN_PLATFORM_IP_HEADER` | Default `x-pf-platform-ip`. Cannot be a forwarding header. |
| `PAYFAST_ITN_PLATFORM_SECRET_HEADER` | Default `x-pf-platform-secret`. |
| `PAYFAST_VALIDATE_STUB=1` | In-process validate stub. Requires local mode and the secret. |
| `PAYFAST_VALIDATE_STUB_HEADER` | Default `x-pf-validate-stub`. |
| `PAYFAST_VALIDATE_URL` | HTTP stub instead of the in-process one. Leave `PAYFAST_VALIDATE_STUB` unset. |
| `PAYFAST_CLIENT_IP_HEADER` | Production source. Default `x-real-ip`. Ignored while local mode is on. |

## 2. Pick a ledger payment

`m_payment_id` is the payment UUID (or its frontend id). `amount_gross` must match `payments.amount`.

```sql
SELECT id, amount, status
FROM payments
WHERE status IN ('DUE', 'OVERDUE')
LIMIT 5;
```

```bash
export PAYMENT_ID='paste-uuid'
export AMOUNT='10.00'   # payments.amount, two decimals
export API='http://127.0.0.1:8787'
export PF_IP='197.97.145.140'
node scripts/payfast-itn-fixture.mjs --payment-id "$PAYMENT_ID" --amount "$AMOUNT" > /tmp/itn.json
```

Every curl below sends the allow-listed PayFast IP on the caller-controlled headers. The platform address is whatever `X-PF-Platform-IP` says.

```bash
SPOOF=(
  -H "x-forwarded-for: $PF_IP"
  -H "forwarded: for=$PF_IP"
  -H "x-client-ip: $PF_IP"
  -H "true-client-ip: $PF_IP"
  -H "cf-connecting-ip: $PF_IP"
  -H "x-original-forwarded-for: $PF_IP"
  -H "x-real-ip: $PF_IP"
)
```

## 3. Cases

Spoofed forwarding headers, platform address not a PayFast IP. Expect `400`, payment stays `DUE`.

```bash
curl -sS -D - -o /tmp/itn.out \
  -X POST "$API/api/payfast/itn" \
  -H 'content-type: application/json' \
  -H "x-pf-platform-secret: $PAYFAST_ITN_PLATFORM_SECRET" \
  -H 'x-pf-platform-ip: 203.0.113.50' \
  -H 'x-pf-validate-stub: VALID' \
  "${SPOOF[@]}" \
  --data-binary @/tmp/itn.json
```

Same spoofed headers, no secret. Expect `400` even though `x-real-ip` is a PayFast IP.

```bash
curl -sS -D - -o /tmp/itn.out \
  -X POST "$API/api/payfast/itn" \
  -H 'content-type: application/json' \
  -H "x-pf-platform-ip: $PF_IP" \
  -H 'x-pf-validate-stub: VALID' \
  "${SPOOF[@]}" \
  --data-binary @/tmp/itn.json
```

Bad sandbox signature. Expect `400`.

```bash
node scripts/payfast-itn-fixture.mjs --payment-id "$PAYMENT_ID" --amount "$AMOUNT" --bad-signature > /tmp/itn-bad-sig.json
curl -sS -D - -o /tmp/itn.out \
  -X POST "$API/api/payfast/itn" \
  -H 'content-type: application/json' \
  -H "x-pf-platform-secret: $PAYFAST_ITN_PLATFORM_SECRET" \
  -H "x-pf-platform-ip: $PF_IP" \
  -H 'x-pf-validate-stub: VALID' \
  "${SPOOF[@]}" \
  --data-binary @/tmp/itn-bad-sig.json
```

Wrong merchant id (signature is valid for that body). Expect `400`.

```bash
node scripts/payfast-itn-fixture.mjs --payment-id "$PAYMENT_ID" --amount "$AMOUNT" --merchant-id 10009999 > /tmp/itn-merchant.json
curl -sS -D - -o /tmp/itn.out \
  -X POST "$API/api/payfast/itn" \
  -H 'content-type: application/json' \
  -H "x-pf-platform-secret: $PAYFAST_ITN_PLATFORM_SECRET" \
  -H "x-pf-platform-ip: $PF_IP" \
  -H 'x-pf-validate-stub: VALID' \
  "${SPOOF[@]}" \
  --data-binary @/tmp/itn-merchant.json
```

Wrong amount. Expect `400`.

```bash
node scripts/payfast-itn-fixture.mjs --payment-id "$PAYMENT_ID" --amount 9999.00 > /tmp/itn-amount.json
curl -sS -D - -o /tmp/itn.out \
  -X POST "$API/api/payfast/itn" \
  -H 'content-type: application/json' \
  -H "x-pf-platform-secret: $PAYFAST_ITN_PLATFORM_SECRET" \
  -H "x-pf-platform-ip: $PF_IP" \
  -H 'x-pf-validate-stub: VALID' \
  "${SPOOF[@]}" \
  --data-binary @/tmp/itn-amount.json
```

Validate stub returns `INVALID`, or `ERROR`. Expect `400`. The payment is not marked paid. PayFast is not contacted.

```bash
curl -sS -D - -o /tmp/itn.out \
  -X POST "$API/api/payfast/itn" \
  -H 'content-type: application/json' \
  -H "x-pf-platform-secret: $PAYFAST_ITN_PLATFORM_SECRET" \
  -H "x-pf-platform-ip: $PF_IP" \
  -H 'x-pf-validate-stub: INVALID' \
  "${SPOOF[@]}" \
  --data-binary @/tmp/itn.json
```

Valid ITN. Expect `200` and `ITN accepted`. `payments.status` becomes `PAID` once.

```bash
curl -sS -D - -o /tmp/itn.out \
  -X POST "$API/api/payfast/itn" \
  -H 'content-type: application/json' \
  -H "x-pf-platform-secret: $PAYFAST_ITN_PLATFORM_SECRET" \
  -H "x-pf-platform-ip: $PF_IP" \
  -H 'x-pf-validate-stub: VALID' \
  "${SPOOF[@]}" \
  --data-binary @/tmp/itn.json
```

Duplicate of that ITN. Expect `200` again. `paid_amount` is the exact `amount_gross` (the same cents as the ledger) and a replay does not change it. A `CANCELLED` ITN leaves `status` and amounts as they were.

```sql
SELECT status, amount, paid_amount FROM payments WHERE id = '<PAYMENT_ID>';
```

## 4. HTTP validate stub instead of the in-process one

Unset `PAYFAST_VALIDATE_STUB` and point the postback at a process you control. The API posts the ITN fields and does not forward the caller's headers, so the stub's response is not chosen by those headers.

```bash
PAYFAST_VALIDATE_STUB_RESULT=INVALID node scripts/payfast-validate-stub.mjs
```

```bash
export PAYFAST_VALIDATE_URL='http://127.0.0.1:8799/validate'
unset PAYFAST_VALIDATE_STUB
```

Restart `npm run dev:api` after changing env. Restart the stub with `PAYFAST_VALIDATE_STUB_RESULT=VALID` for the paid case. The stub listens on `127.0.0.1` only.

## 5. Production-shaped IP check

Leave `PAYFAST_ITN_LOCAL` unset. The only address read is `PAYFAST_CLIENT_IP_HEADER` (default `x-real-ip`). On a laptop that header is still caller-supplied, which is why the cases above use local mode. This mode is what Vercel runs: the edge overwrites `x-real-ip`, and a spoofed `X-Forwarded-For` cannot replace it.

Set `PAYFAST_CLIENT_IP_HEADER=x-forwarded-for` only when the proxy appends the client address. `PAYFAST_TRUSTED_PROXY_HOPS` (default `1`) counts from the right, so the address the nearest trusted proxy added is the one that is used.
