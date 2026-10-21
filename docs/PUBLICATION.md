# Publication and privacy

The public repository contains the standalone M3000/M2000 editor, required shared MIDI Studio services, build/test
scripts, the parameter data it is generated from and device notes. It excludes upstream Git history, research and
audit reports, physical MIDI captures, device dumps, vendor PDFs and images, local caches, credentials and personal
workspace paths. The reading traces of the data files are reduced to the reader, model and date.

The automated leak gate checks common credential patterns, personal home paths, private network addresses, email
addresses and embedded image metadata. Maintainers can additionally use a private denylist stored outside Git; the
default location is described in `scripts/leak-gate.mjs`. Findings identify files/rules without echoing the matched
value. CI runs the generic checks on source, commit identities/messages and `dist`. These checks reduce accidental
disclosure; they cannot prove anonymity.

Before a maintainer push:

```sh
npm test
META_CSP=1 npm run build
npm run leak-gate -- --artifact dist
```

There is no analytics SDK or application server. MIDI messages go only to the ports you choose. Drafts are not uploaded. Downloads
are explicit. Clearing site data removes browser-held drafts; export copies first. Deployment is performed by the
pinned Pages workflow; only `dist` is uploaded as the site. A successful local build is not deployment proof: inspect
the Actions run and the live site after pushing.
