# static

One file, served verbatim, no build step.

`apple-developer-domain-association.txt` is the token Apple issues when you add
`api.offload.club` to the Services ID `club.offload.web`. Download it from the
Apple Developer portal's Configure sheet and save it here with exactly that
name, then deploy. Apple's Verify button fetches
`https://api.offload.club/.well-known/apple-developer-domain-association.txt`
and compares.

It is not a secret. It proves control of the domain and grants nothing.
