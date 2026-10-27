# ATS Application Tailor

A one-page web app that takes your CV and a job description and produces:

1. Fit evaluation with verdict and 1–100 match score
2. HR prescreen (gaps, red flags, eligibility)
3. Tailoring recommendations
4. ATS keyword report (exact / synonym / missing, and where each was placed)
5. Full tailored CV (plain text, ATS-safe)
6. Full tailored cover letter
7. Salary expectations (with web search)
8. Suggested file names

Everything runs in your browser. There is no server. Your CV and JD are sent only to the AI provider you choose, using your own API key.

## Use it

1. Open the page.
2. Upload your CV (PDF, DOCX or TXT) or paste it. Check the extracted text.
3. Paste the JD text. A link also works if web search is on, but pasting is more reliable.
4. Choose provider, enter your API key, pick language and employer style.
5. Click **Analyse and tailor**. It takes 1–4 minutes.
6. Use the tabs to view each section. Copy it or download it as .txt or .doc.

## Publish on GitHub Pages

1. Create a new repository and upload these files to its top level.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **Deploy from a branch**, **Branch** to `main`, folder `/ (root)`. Click **Save**.
4. After 1–2 minutes the page is live at `https://YOUR-USERNAME.github.io/REPO-NAME/`.

## API keys

- Anthropic: console.anthropic.com → API keys. Web search must be enabled for your organisation in the console.
- OpenAI: platform.openai.com → API keys.

Set a monthly spending limit with your provider. Each run costs a small amount, more with web search.

## Privacy

- Never commit your CV or API key to the repository. A public repository is visible to everyone.
- The key is kept only in your browser, and only if you tick "Remember".
- Do not paste confidential employer documents into any AI service unless your organisation allows it.

## Changing the instructions

All instructions to the AI are in `prompt.js`. Edit the rules there to change tone, sections or formatting.

## Limits

- Most career portals block fetching from a browser. Paste the JD text when the fetch fails.
- Scanned (image) PDFs have no text to extract. Use a DOCX or paste the text.
- The AI can still make mistakes. Check every claim against your real CV before submitting.
