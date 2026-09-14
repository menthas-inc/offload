The row under a turn. Renders nothing when the turn has nothing to report.

```jsx
<TurnFooter state="done" onOpenRef={open}
  refs={[{id:"bbq",name:"Ana's bbq",kind:"thread"}]}
  sources={[{domain:"timeanddate.com",url:"https://www.timeanddate.com/holidays/us/memorial-day"}]}/>

// A dump that was filed and said nothing back: the footer is the whole reply.
<TurnFooter state="done" refs={[{id:"flat",name:"Flat admin",kind:"thread"}]}/>
```

- **Below both bubbles, never inside one.** A row's press fill bleeds a space step past its
  container, which is a turn's own padding, so inside a bubble the two cancel and a square
  fill runs out under a rounded corner.
- **Order is fixed:** state, threads, sources. Not sorted and not by count.
- **An answering turn passes no state and no refs.** It wrote nothing, so there is no Done
  mark and nothing was filed; the result card's own header is the link to the thread.
- Three sources then a count. The count is text: there is no screen listing what a turn read.
- A source chip leaves the app. It is the one external link in the conversation, allowed
  because its label is a domain from the read record rather than page-authored text.
