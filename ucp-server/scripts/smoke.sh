#!/usr/bin/env bash
set -euo pipefail

BASE="${BASE:-http://localhost:3001}"
H_AGENT='UCP-Agent: profile="http://localhost:3002/profile"'
H_RID='Request-Id: smoke-1'

pretty() { node -e "try{console.log(JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')),null,2))}catch{console.log('')}"; }

echo '=== health & jwks ==='
curl -sS "$BASE/healthz"; echo
curl -sS "$BASE/.well-known/jwks.json" | pretty | head -20
echo

echo '=== catalog ==='
curl -sS "$BASE/catalog" | pretty | head -10
echo

echo '=== POST /checkout-sessions ==='
CREATE=$(curl -sS -X POST "$BASE/checkout-sessions" \
  -H "$H_AGENT" -H "$H_RID" -H "Idempotency-Key: sm-create" \
  -H "Content-Type: application/json" \
  -d '{"currency":"TWD","line_items":[{"item":{"id":"sony-wh1000xm6"},"quantity":{"original":1,"total":1,"fulfilled":0}}]}')
echo "$CREATE" | pretty
ID=$(echo "$CREATE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
echo "ID=$ID"

echo '=== PUT /checkout-sessions/$ID ==='
curl -sS -X PUT "$BASE/checkout-sessions/$ID" \
  -H "$H_AGENT" -H "$H_RID" -H "Idempotency-Key: sm-put" \
  -H "Content-Type: application/json" \
  -d '{"buyer":{"email":"a@b.c","first_name":"A","last_name":"B"},"fulfillment":{"destinations":[{"recipient":"A","line1":"x","city":"TP","postal_code":"100","country":"TW"}],"method_type":"shipping"},"payment":{"instruments":[{"handler_id":"google-pay-mock","type":"wallet"}]}}' \
  | pretty | head -30

echo '=== GET /checkout-sessions/$ID (status should be ready_for_complete) ==='
curl -sS "$BASE/checkout-sessions/$ID" -H "$H_AGENT" -H "$H_RID" \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('status =',j.status);console.log('total =',j.totals.find(t=>t.type==='total').amount)})"

echo '=== POST /checkout-sessions/$ID/cancel (demo only) ==='
curl -sS -X POST "$BASE/checkout-sessions/$ID/cancel" \
  -H "$H_AGENT" -H "$H_RID" -H "Idempotency-Key: sm-cancel" \
  -H "Content-Type: application/json" -d '{}' \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('status =',j.status)})"

echo
echo '✅ smoke script complete'
