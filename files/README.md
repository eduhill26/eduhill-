# EduHill — Cloudflare Worker + KV backend सेटअप

इस फ़ोल्डर में 2 हिस्से हैं:

```
worker/            -> Cloudflare Worker (backend + storage)
  src/index.ts
  wrangler.jsonc
frontend/           -> आपका EduHill ऐप (GitHub Pages पर होस्ट होगा)
  index.html
```

क्यों? पहले ऐप का डेटा सिर्फ Claude के अंदर सेव होता था। अब डेटा
Cloudflare KV (सर्वर पर) में सेव होगा, तो GitHub Pages पर होस्ट करने के
बाद भी, और browser का data/cache clear करने पर भी, आपके नोट्स और
सवाल डिलीट नहीं होंगे।

---

## स्टेप 1 — Worker डिप्लॉय करें

आपके कंप्यूटर पर Node.js इंस्टॉल होना चाहिए (nodejs.org से डाउनलोड करें)।

```bash
cd worker
npm install -g wrangler        # एक बार, अगर पहले से इंस्टॉल नहीं है
wrangler login                 # Cloudflare account से लॉगिन (browser खुलेगा)

# KV namespace बनाएं
wrangler kv namespace create EDUHILL_KV
```

ऊपर वाली कमांड से एक `id` मिलेगा, जैसे:
```
{ binding = "EDUHILL_KV", id = "abcd1234..." }
```
यह `id` कॉपी करके `wrangler.jsonc` में `PASTE_YOUR_KV_NAMESPACE_ID_HERE`
की जगह डालें।

अब एक सीक्रेट key सेट करें (यह किसी और को अंदाज़ा न लगने वाली लंबी
random string रखें — यही key आपके नोट्स को बाकी लोगों से सुरक्षित रखेगी):

```bash
wrangler secret put API_KEY
# prompt पर अपनी secret key टाइप करें, Enter दबाएं
```

अब डिप्लॉय करें:

```bash
wrangler deploy
```

आखिर में टर्मिनल में एक URL दिखेगा, जैसे:
```
https://eduhill-worker.<आपका-subdomain>.workers.dev
```
**यह URL सेव कर लें** — अगले स्टेप में चाहिए होगा।

---

## स्टेप 2 — frontend/index.html में अपनी वैल्यू डालें

`frontend/index.html` फाइल खोलें, `<script>` के अंदर शुरुआत में यह
दो लाइनें ढूंढें:

```js
var API_BASE = 'https://eduhill-worker.YOUR-SUBDOMAIN.workers.dev';
var API_KEY = 'PASTE_YOUR_API_KEY_HERE';
```

- `API_BASE` को स्टेप 1 से मिले असली Worker URL से बदलें
- `API_KEY` को वही key डालें जो आपने `wrangler secret put API_KEY` में दी थी

फाइल सेव करें।

---

## स्टेप 3 — GitHub रेपो में डालें

आपका रेपो: https://github.com/eduhill26/eduhill-

1. रेपो खोलें → **Add file** → **Upload files**
2. `frontend/index.html` फाइल को अपलोड करें (चाहें तो नाम बदलकर सीधे
   `index.html` रख दें, ताकि GitHub Pages इसे root से उठा ले)
3. नीचे "Commit changes" पर क्लिक करें
4. (चाहें तो) `worker/` फोल्डर भी उसी रेपो में एक अलग सब-फोल्डर के रूप
   में अपलोड कर दें, ताकि backend कोड भी वहीं सेव रहे

---

## स्टेप 4 — GitHub Pages चालू करें (ऐप को पब्लिक URL दें)

1. रेपो में **Settings** → **Pages**
2. **Source**: "Deploy from a branch" चुनें
3. **Branch**: `main`, फोल्डर `/ (root)` चुनें → **Save**
4. कुछ मिनट बाद आपका ऐप यहां लाइव होगा:
   `https://eduhill26.github.io/eduhill-/`

---

## नोट — सुरक्षा

`API_KEY` फ्रंटएंड की JS फाइल में दिखता है, इसलिए अगर रेपो **public**
है तो कोई भी view-source करके वह key देख सकता है। पर्सनल नोट्स ऐप के
लिए यह आमतौर पर ठीक है, लेकिन ज़्यादा प्राइवेसी चाहिए तो:
- रेपो को **Private** रखें (GitHub Pages का Private repo फीचर, या
  किसी अलग स्टेटिक होस्ट का इस्तेमाल करें), या
- आगे चलकर Cloudflare Access / लॉगिन जोड़ें

---

## टेस्ट करने का तरीका (डिप्लॉय के बाद)

```bash
curl https://eduhill-worker.<subdomain>.workers.dev/api/data \
  -H "Authorization: Bearer <आपकी API_KEY>"
```
जवाब में `{"notes":[],"questions":[]}` जैसा कुछ दिखना चाहिए।
