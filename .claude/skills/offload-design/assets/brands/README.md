# Third-party brand marks

Drop provider logos here. Nothing in this folder is drawn by us and nothing in it should be
edited: a mark's corner radius, its colours and its letterforms are the owner's specification,
and an approximation that is 90% right is the one kind of wrong people spot instantly on a
logo they see every day.

## Wanted

| File | Where it comes from | Used by |
| --- | --- | --- |
| `google-calendar.svg` | Google's own brand resources, the Calendar product icon | `ConnectScreen` (iOS), `M3ConnectScreen` (Android), `explorations/connect-apps.html` |

Square-ish source is right: both kits render it at 88px with `objectFit: contain` and a
rounded corner, and neither crops.

`mark` has no default, deliberately. Pointing it at this path before the file exists makes
every mount fire a 404 that `onError` can only clean up after the fact, which is a console
error in a kit consumers open. The host passes the asset:

    <ConnectScreen mark={googleCalendarMark}/>
    <M3ConnectScreen mark={googleCalendarMark}/>

With nothing passed, both screens draw a dashed stand-in, so a missing asset is visible
rather than silent.

Google's terms govern how their marks appear in a connect flow, including minimum clear
space and no recolouring. The 88px rounded container may need adjusting to satisfy the
clear-space rule; check before ship.
