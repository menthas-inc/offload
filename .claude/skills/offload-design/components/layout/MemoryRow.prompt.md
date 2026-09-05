The memories section on a thread. Up to ten, and a section holding none draws nothing at all.

Rows rather than chips, decided 5 September 2026: a memory runs to 200 characters and a chip truncated it to something you had to click to read.

```jsx
<MemoryRow text="Ana pays by bank transfer, not card, and wants the invoice a week ahead"
  origin="learned" author="Sam" open={openId===m.id}
  onOpen={()=>setOpenId(m.id)} onClose={()=>setOpenId(null)}
  onSave={save} onDelete={mine?remove:undefined} onMute={mine?undefined:mute}/>
```
