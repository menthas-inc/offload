# Notifications

Two components, one per platform, for the three shapes offload sends: something worth
knowing, something with one thing to do, something with two.

- `NotificationIOS` — the banner. `actions` render the **expanded** state, because a
  collapsed iOS banner cannot carry a button: full-width rows, 44pt minimum, hairline
  between them. In code they are `UNNotificationAction`s inside a registered
  `UNNotificationCategory`.
- `NotificationAndroid` — the shade card. `actions` are text buttons inside the card,
  always visible, tinted `blue-700` like the Android navigation accent. In code they are
  `addAction` with a `PendingIntent`; three is the platform maximum.

Both are painted by the system, so their surfaces are written out rather than themed, and
neither animates: the entrance belongs to the OS.

Copy rules: the title says what happened, not what the app is. The body carries the detail
offload already knows, so the notification is worth reading on its own. Actions are verbs,
never Yes or OK, ordered by likelihood, and a destructive one goes last.
