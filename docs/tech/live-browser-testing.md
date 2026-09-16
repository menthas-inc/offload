# Live testing from an agent session

How a session drives offload.club in a real browser and on the phone. Written
2026-09-15 from the first usability pass, which found seven things the suites
could not: a two-part question that went partial every time, a Finish it that
doubled the reply, a Stop that appeared a third of a second into a resumed turn,
a window under 1180 with no way to Settings, and the step line landing after
Stop. None of them is visible from a test that stubs the model or the browser.

## Two browsers, pick the right one

- **The app's Browser pane** (`mcp__Claude_Browser__*`) is a clean browser with no
  logins. Good for the marketing page, the privacy page, a local dev server.
  Useless for the shell, which is behind sign in.
- **Claude in Chrome** (`mcp__claude-in-chrome__*`) is the person's own Chrome
  with their session in it, so `/today` opens signed in. This is the one for the
  product. The tools are deferred: load them in one `ToolSearch`, e.g.
  `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__resize_window,mcp__claude-in-chrome__tabs_close_mcp`.
  If the connector does not resolve, the session needs restarting; if it still
  does not, the connector needs pairing on the claude.ai side.

## The loop

1. `tabs_context_mcp` with `createIfEmpty: true`, work in the tab it gives you,
   close it with `tabs_close_mcp` before finishing. A tab id that comes back
   "not in the group" means the group was dissolved: call `tabs_context_mcp`
   again.
2. `navigate`, `wait` a few seconds, then read before acting: `read_page`
   (interactive filter gives every control with a `ref_N`), `find`, or
   `javascript_tool` for a fact (a count, a boolean, a list of button labels).
   Never return raw HTML or anything carrying a token from `javascript_tool`.
3. Act with `computer`: click by `ref` or by coordinates from the last
   screenshot. Refs go stale on navigation, so read again after one.
4. **Batch.** `browser_batch` runs a list in one round trip and stops at the
   first error. Anything you can predict two steps ahead goes in one batch. A
   ref found inside a batch cannot be used later in the same batch.
5. Verify with `read_page` or `javascript_tool` when the question is "is this
   text there" or "how many"; screenshots for layout and colour. A screenshot
   taken in the first second after a load shows the shell before its icons
   arrive; wait, or read the tree instead.

## Things that only show up here

- **A turn is measured, not eyeballed.** Screenshots at guessed offsets miss
  every transition. Poll the DOM from `javascript_tool` every 250ms and record
  the changes: which of the writing dots, the step line and Stop are on screen,
  and when the turn settles. The poll used on the first pass:

  ```js
  const t0=Date.now(); const out=[]; let seen=false;
  const state=()=>{const step=document.querySelector('[class*="workingStep"]');
    const dots=document.querySelector('[class*="writing"]');
    const b=[...document.querySelectorAll('button')].map(x=>x.textContent.trim());
    return (step?'STEP:'+step.textContent.trim():'')+(dots?' DOTS':'')+(b.includes('Stop')?' STOP':'')+(b.includes('Finish it')?' FINISHIT':'')||'none';};
  let last=null;
  while(Date.now()-t0<60000){const s=state(); if(/DOTS|STEP|STOP/.test(s)) seen=true;
    if(s!==last){out.push(((Date.now()-t0)/1000).toFixed(1)+'s '+s); last=s;}
    if(seen && !/DOTS|STEP|STOP/.test(s)) break; await new Promise(r=>setTimeout(r,250));}
  out.join(' | ')
  ```

- **The server's side of a turn is in the agent log**, not on screen:
  `railway logs --service agent --lines 400`. A `dump partial` line names which
  tools failed; a `looked up` line per lookup says used, empty, failed or
  refused. A turn that reads wrong on screen and clean in the log is a client
  bug; the other way round is the worker's.
- **The narrow shell.** `resize_window` to 1000 or 680 wide. Below 1180 there
  is one pane and the crumb bar is a back button; the sidebar stays.
- **Real dumps are real.** Everything typed into the composer lands on the
  person's account and files into their threads. Ask a question rather than
  filing something when a turn is all you need, and say what was sent. Settings
  toggled for a check get toggled back.
- **Nothing here stubs the model**, which is the point: the two-part question
  that always went partial passed every eval because the eval's lookup could
  not be refused.

## The phone

An Android device over adb, USB or wifi. The app is the EAS development build
pointed at production, loading its bundle from a local Metro:

1. `adb devices`; over wifi, `adb mdns services` then `adb connect <ip>:<port>`.
2. **`adb reverse tcp:8081 tcp:8081`** every time the device reconnects. Without
   it the app shows "Unable to load script", which reads like Metro and is not.
3. Metro is `pnpm --filter mobile dev` in `apps/mobile`, if one is not already
   listening on 8081 (`lsof -nP -iTCP:8081`).
4. `adb shell monkey -p club.offload.app -c android.intent.category.LAUNCHER 1`
   launches it; `adb shell input keyevent 82` opens the dev menu, and Reload is
   the first button. A client change needs a reload, not a build.
5. Drive it with `adb shell input tap X Y` and capture with
   `adb exec-out screencap -p > shot.png`, then `sips -Z 900` to view. A Pixel 9
   is 1080x2424, so a 401-wide capture scales by 2.693.

**Anything native cannot be tested this way.** An icon, a plugin, a permission
string is baked at build time. A local `expo run:android` builds fine with
Android Studio's JDK but cannot install over the EAS-signed app; verify the
built resources and ship it through the next EAS development build. See
`apps/mobile/EAS.md`.

## Reporting

First line: which build was tested (the commit on main, the deploy status). Then
per scenario: pass or fail, and for a fail one line of repro and where in the
code it points. Findings ranked by severity. Things seen and deliberately left
alone go in their own list, so the next pass does not rediscover them.
