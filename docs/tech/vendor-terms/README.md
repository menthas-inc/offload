# Vendor terms, as captured

Dated copies of the pages that say what each company receiving content may do
with it. `decisions.md` makes a no-training term and short provider-side
retention a requirement of every such vendor, and the privacy page says as
much in public, so the claim has to be showable rather than remembered. Each
capture is the page as served on the date in its name, with a `.txt` beside
the HTML ones for reading and grepping. Re-capture when a vendor announces a
change to its terms, and once a year regardless.

## AssemblyAI (voice notes, transcription)

| Page | File | What it establishes |
|---|---|---|
| Data retention and model training | `assemblyai/data-retention-and-model-training-2026-09-26.md` | Submitted files are used for training unless the request goes to the European servers, the account has opted out, or a BAA applies. Uploads to the asynchronous service begin deletion at 24 hours; transcripts are kept 30 days by default. |
| Are files used for model training (FAQ) | `assemblyai/faq-files-used-for-model-training-2026-09-26.html` | The same statement, in the FAQ. |
| How to opt out | `assemblyai/faq-how-to-opt-out-2026-09-26.md` | The opt-out is per account, on paid plans, forward-looking only. |
| Terms of service | `assemblyai/terms-of-service-2026-09-26.html` | Section 4.6, the training licence over de-identified data and the opt-out that switches it off. |
| Data processing addendum | `assemblyai/data-processing-addendum-2026-09-26.html` | The processor terms. |

**offload's condition:** the worker only ever calls `api.eu.assemblyai.com`, a
constant with a test that any other host raises (decision of 2026-09-21), so
no file offload sends is training material by the vendor's own page. The
account-level opt-out is a second lock worth turning when the plan allows it.

## Voyage AI (embeddings)

| Page | File | What it establishes |
|---|---|---|
| Terms of service | `voyage/terms-of-service-2026-09-26.html` | Section 3(iii): by default the customer grants a licence to use content to train and improve the service, and the customer may opt out of that clause. |
| Privacy policy | `voyage/privacy-policy-2026-09-26.html` | Section 4 says the same about customer content and training. |
| Docs FAQ | `voyage/docs-faq-2026-09-26.html` | Opting out also stops storage of the data for hosted endpoints, so retention is zero days. Data sent before the opt-out stays under the old licence. |

**offload's condition, and the one open action:** the opt-out is a switch at
the bottom of the Terms of Service page inside the Voyage dashboard, per
account, forward-looking only. It must be on. Record here the date it was
turned on and by whom; until that line exists, treat the vendor as training
on what it receives.

- Opt-out turned on: _not yet recorded_.

## Anthropic (the model)

| Page | File | What it establishes |
|---|---|---|
| Commercial terms | `anthropic/commercial-terms-2026-09-26.html` | Anthropic may not train models on customer content from the services. |
| API and data retention | `anthropic/api-and-data-retention-2026-09-26.md` | What is retained and for how long; retained data is never used for training without express permission; zero data retention is available on request. |
| Privacy center, model training | `anthropic/privacy-center-model-training-2026-09-26.html` | The plain-language statement that commercial inputs and outputs are not used for training by default. |

**offload's condition:** none needed beyond the default. Zero data retention
is the thing to ask for before GA if the retention window matters to the
privacy page's wording.

## Google Maps Platform

Not switched on. `decisions.md` gates it on reading its terms and adding a
privacy row of its own; capture them here on that day.
