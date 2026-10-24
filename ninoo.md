
NicrronNinoo at VC Hack GTM — Betaworks
Participant guide and sponsor kit
Nicrron API (nicrron.ai)  ·  Ninoo Builder (app.ninoo.ai)  ·  Ninoo Code CLI (ninoo.ai)  ·  nicrronninoo.ai
Your code: BETAWORKS250  —  $250 in credits per participant, plus $10 for signing up ($260 total). Redeem and use it by October 24, 2026, 11:59 PM ET, when unused promo credit expires.
Start on Nicrron:  https://nicrron.ai/redeem?code=BETAWORKS250
                                              (or)
Start on Ninoo:  https://app.ninoo.ai/redeem?code=BETAWORKS250
One account works on every app, so either link is fine. Don’t use both account gets flagged.

How to qualify — read this first
Three rules. Miss any one of them and your entry is disqualified:
1.  Build your app with the Ninoo Builder at https://app.ninoo.ai. Apps built with any other tool don't qualify.
2.  Publish your listing on Ninoo Marketplace before judging: in the Builder, open More → Marketplace, fill in the listing and press Publish listing. It goes live instantly at https://market.ninoo.ai — that marketplace page is what the judges see. No listing, no entry.
3.  Any AI your app calls goes through the Nicrron API (https://api.nicrron.ai/v1), not a provider's API directly. Apps built in Ninoo get this for free: add AI from More → Integrations → Nicrron AI.
1. Get started in 5 minutes
One NicrronNinoo account signs you in everywhere: the Nicrron API, the Ninoo Builder and the Ninoo Code CLI. Your credits are shared across all three.
Step 1 · Create your account and get your credits
1.  Open one of these links and click Create an account (the code is filled in for you):
•  Starting with the API: https://nicrron.ai/redeem?code=BETAWORKS250
•  Starting with the Builder: https://app.ninoo.ai/redeem?code=BETAWORKS250
2.  Open the email “Confirm your NicrronNinoo account” from no-reply@ninoo.ai and click Confirm email. Not there after a minute? Check spam or promotions.
3.  You're in, with $260 of credit: $10 for signing up plus $250 from BETAWORKS250.
Already have an account? Open either link, sign in, and click Redeem.
Step 2 · Pick how you want to build
Path A — Ninoo Builder: build a full app by describing it (about 3 minutes)
1.  Go to https://app.ninoo.ai and sign in.
2.  Describe your app in plain English. Ninoo writes the code and runs it in a live preview.
3.  Want your own logo, photos or a screenshot of a design in the app? Click the image button next to the message box, or paste or drag images in. Ninoo can see them and put them on your site.
4.  Keep chatting to change anything. Made a mistake? Click Undo.
5.  Click Publish to get a public link at your-app.ninoo.app.
6.  Required: open More → Marketplace, fill in your listing (title, tagline, a line on what it does) and press Publish listing. It appears on https://market.ninoo.ai instantly — that page is your entry.
7.  To keep your code, click Download (a ZIP) or push it to your own GitHub repository from More → Download & GitHub.
8.  Have code already? Import a project from GitHub or a ZIP file.
Path B — Nicrron API: call 80+ AI models with one key (about 2 minutes)
1.  Create an API key at https://nicrron.ai/dashboard/keys.
2.  Use any OpenAI-compatible SDK and point it at Nicrron:
Python
# pip install openai
from openai import OpenAI

client = OpenAI(base_url="https://api.nicrron.ai/v1", api_key="YOUR_NICRRON_KEY")
reply = client.chat.completions.create(
    model="nicrron/auto",   # or "anthropic/claude-sonnet-5", "openai/gpt-5.5", ...
    messages=[{"role": "user", "content": "Hello, Betaworks!"}],
)
print(reply.choices[0].message.content)


JavaScript / TypeScript
// npm install openai
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "https://api.nicrron.ai/v1",
  apiKey: process.env.NICRRON_API_KEY,
});
const reply = await client.chat.completions.create({
  model: "nicrron/auto",
  messages: [{ role: "user", content: "Hello, Betaworks!" }],
});
console.log(reply.choices[0].message.content);


Choose a model
Model names
Let Nicrron pick for you
nicrron/auto, nicrron/reasoning, nicrron/coding, nicrron/fastest, nicrron/cheapest
Pick a specific model
anthropic/claude-opus-5, anthropic/claude-sonnet-5, openai/gpt-5.5, xai/grok-4.6, deepseek/deepseek-v4-flash, moonshot/kimi-k3, z-ai/glm-5.3, mistral/mistral-large-3
Images and video
google/nano-banana-pro, google/veo-3.1-fast
Try without code
Playground — chat with any model in your browser


Path C — Ninoo Code: an AI coding agent in your terminal
1.  Install it (needs Node 20+; macOS or Linux, or WSL on Windows):
curl -fsSL https://ninoo.ai/install.sh | sh


2.  Run ninoo login and approve in your browser.
3.  Run cd your-project && ninoo, or give it a task directly: ninoo "add a login page".
2. Promo code
Code
BETAWORKS250
Credit per participant
$250, plus the $10 everyone gets at sign-up = $260
Redeem by
October 24, 2026, 11:59 PM ET
Works on
Nicrron API, Ninoo Builder and Ninoo Code — one shared balance
Limits
Once per account
Unused credit
Expires with the code, October 24, 2026, 11:59 PM ET. Whatever is left of the $250 is removed then; the $10 sign-up credit stays.
Where to redeem
https://nicrron.ai/redeem?code=BETAWORKS250  or  https://app.ninoo.ai/redeem?code=BETAWORKS250


How far it goes: a typical Builder message costs about $0.10 and a running Builder preview costs $0.01 a minute, so $250 is far more than a weekend of heavy building needs.
3. Docs, quickstarts and starter ideas
What
Link
API quickstart
https://nicrron.ai/docs/quickstart
API keys and authentication
https://nicrron.ai/docs/authentication
All models and smart routers
https://nicrron.ai/docs/models
SDKs (Python, JavaScript and more)
https://nicrron.ai/docs/sdks
Images and video
https://nicrron.ai/docs/media
Embeddings
https://nicrron.ai/docs/embeddings
Audio
https://nicrron.ai/docs/audio
Live model list (JSON)
https://api.nicrron.ai/v1/models
Ninoo Builder
https://app.ninoo.ai
Ninoo Marketplace (publish your listing here)
https://market.ninoo.ai
Listing your app on the marketplace
https://ninoo.ai/docs/builder/market/
How Ninoo works
https://ninoo.ai/how-it-works/
Ninoo Code docs
https://ninoo.ai/docs/
Ninoo Code download
https://ninoo.ai/download/


Starter ideas for the Builder
Paste one of these into app.ninoo.ai to get going:
•  “A waitlist landing page for my startup with email capture and a referral leaderboard”
•  “A lead qualifier: I paste a list of company websites and it scores each one against my ideal customer profile”
•  “A cold-outreach drafter: paste a prospect's site or bio and it writes three personalized opening lines”
•  “A sales-call summarizer that turns a pasted transcript into follow-up actions and a CRM-ready note”
•  “A pricing page with three tiers, an FAQ, and Stripe checkout”
•  “A GTM funnel dashboard with stages, sample data and conversion charts”
4. Branding for the sponsor section

One-line description
NicrronNinoo: one API for 80+ AI models (Nicrron) and an AI agent that builds and ships your app from a plain-English description (Ninoo), all on one account.
Short version: NicrronNinoo: one API for every major AI model, plus an AI agent that builds your app.
Logos
Use
Link
Logo for light backgrounds (SVG)
https://nicrronninoo.ai/brand/nicrronninoo-logo.svg
Logo for light backgrounds (PNG)
https://nicrronninoo.ai/brand/nicrronninoo-logo.png
Logo for dark backgrounds (SVG)
https://nicrronninoo.ai/brand/nicrronninoo-logo-white.svg
Logo for dark backgrounds (PNG)
https://nicrronninoo.ai/brand/nicrronninoo-logo-white.png
Square icon (512 px)
https://nicrronninoo.ai/brand/nicrronninoo-icon.png
Full kit, including separate Nicrron and Ninoo logos (ZIP)
https://nicrronninoo.ai/nicrronninoo-brand-kit.zip


Website: https://nicrronninoo.ai
