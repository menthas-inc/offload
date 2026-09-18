A read, as one card, under an offload reply. Up to three of them per answer.

```jsx
<AnswerResult thread={{id:"lisbon",name:"Lisbon trip"}} count={3} shown={5}
  rows={[{id:"1",title:"Book the airport transfer",meta:"you, added 6 Aug"},
         {id:"2",title:"Pay Ana €214 for the flights",meta:"Ana, due Thursday",done:true}]}
  onToggle={tick} onOpenThread={()=>open("lisbon")} />

<AnswerResult thread={{id:"office",name:"Office"}} count="20 of 46" truncated threadTotal={26}
  rows={read} onToggle={tick} onOpenThread={()=>open("office")} />
```

Rules it carries, so callers do not have to:

- The header is the only link out, one per result, not one per row. Do not draw a `Chip`
  for the same thread beside it.
- `shown` is 5 on the phones and 8 on web. Anything longer stops being a reply.
- The Show more count is the honest remainder of what arrived, and a truncated read gets
  the thread as its tail instead, because what was not read was not sent.
- A finished row is tertiary ink, a 1px strike and the moss tick. Never opacity.
- The tick's name carries the thread: "Book the airport transfer, Lisbon trip".
