/* Wrapped in an IIFE: these helpers must not sit in global scope, where they
   would collide with the same names in the widget files. */
(function(){
const TODAY="2026-08-11"; /* the kit's single source of truth for "today" */
const D=["Mon","Tue","Wed","Thu","Fri","Sat","Sun"],M=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmt(iso){const x=new Date(iso+"T00:00:00");return D[(x.getDay()+6)%7]+" "+x.getDate()+" "+M[x.getMonth()]}
function plusDays(iso,n){const x=new Date(iso+"T00:00:00");x.setDate(x.getDate()+n);return x.toISOString().slice(0,10)}

window.OFFLOAD_DATA={
  todayIso:TODAY,
  /* One list by last activity, then older threads (gone quiet). Always on was retired on
     1 October 2026; a slow thread sinks and comes back up when something lands. */
  spaces:[
    {id:"lisbon",name:"Lisbon trip",icon:"lasso",kind:"now",count:14,people:["Ana","Tom"],meta:"14 things · Ana, Tom"},
    {id:"shelf",name:"Bookshelf build",icon:"lasso",kind:"now",count:9,people:[],meta:"9 things · just you"},
    {id:"dentist",name:"Dentist and insurance",icon:"lasso",kind:"now",count:5,people:[],meta:"5 things · just you"},
    {id:"read",name:"Read later",icon:"bookmark",kind:"now",count:23,people:[],meta:"23 things · 4 unread this week"},
    {id:"home",name:"Flat admin",icon:"house",kind:"now",count:6,people:["Sam"],meta:"6 things · Sam"},
    {id:"gifts",name:"Gift ideas",icon:"bookmark",kind:"now",count:11,people:[],meta:"11 things · just you"},
    {id:"berlin",name:"Berlin, March",icon:"lasso",kind:"older",count:31,people:["Ana"],meta:"31 things · last opened in April"},
    {id:"bike",name:"Bike repair",icon:"lasso",kind:"older",count:8,people:[],meta:"8 things · last opened in March"},
    {id:"tax",name:"Tax return 2025",icon:"lasso",kind:"older",count:19,people:[],meta:"19 things · finished in January"},
    {id:"wedding",name:"Sam's wedding",icon:"lasso",kind:"older",count:44,people:["Sam","Ana"],meta:"44 things · finished last year"},
    {id:"flat",name:"Flat hunt",icon:"lasso",kind:"older",count:27,people:[],meta:"27 things · finished last year"}
  ],
  /* Things without a thread (1 October 2026). On main these live in the account's default
     thread, which is never drawn as a thread. sug: an existing thread id (to), or a proposed
     new thread with the ids it would hold (name, with). */
  loose:[
    {id:"l1",type:"note",icon:"text-quote",title:"Oak brackets, 30cm, matte black",meta:"Note \u00b7 just now",sug:{name:"Kitchen shelves",with:["l1","l6","l7"]}},
    {id:"l2",type:"photo",icon:"image",title:"Boiler service receipt",meta:"Photo \u00b7 Monday",sug:{to:"home"}},
    {id:"l3",type:"link",icon:"link",title:"Miso aubergine, a recipe",meta:"Link \u00b7 yesterday"},
    {id:"l4",type:"event",icon:"calendar",title:"Drinks with Priya",meta:"Event \u00b7 Thursday 19:00"},
    {id:"l5",type:"link",icon:"link",title:"Hotels near Alfama",meta:"Link \u00b7 Sunday",sug:{to:"lisbon"}},
    {id:"l6",type:"link",icon:"link",title:"Wall plugs for plasterboard",meta:"Link \u00b7 Sunday",sug:{name:"Kitchen shelves",with:["l1","l6","l7"]}},
    {id:"l7",type:"photo",icon:"image",title:"Photo of the alcove",meta:"Photo \u00b7 Saturday",sug:{name:"Kitchen shelves",with:["l1","l6","l7"]}},
    {id:"l8",type:"todo",icon:"square-check-big",title:"Renew passport",meta:"To-do \u00b7 no date"},
    {id:"l9",type:"todo",icon:"square-check-big",title:"Call the landlord about the damp",meta:"To-do \u00b7 no date",sug:{to:"home"}},
    {id:"l10",type:"link",icon:"link",title:"A podcast on sleep",meta:"Link \u00b7 last week"},
    {id:"l11",type:"note",icon:"text-quote",title:"Ana's shoe size is 38",meta:"Note \u00b7 last week"},
    {id:"l12",type:"link",icon:"link",title:"Flat-pack desk, 120cm",meta:"Link \u00b7 2 weeks ago"},
    {id:"l13",type:"photo",icon:"image",title:"Parking sign on Elm Road",meta:"Photo \u00b7 2 weeks ago"},
    {id:"l14",type:"todo",icon:"square-check-big",title:"Return the library books",meta:"To-do \u00b7 no date"}
  ],
  today:[
    {id:1,icon:"map-pin",title:"Miradouro da Senhora do Monte",meta:"Lisbon trip · from Safari",time:"2m",tag:"Lisbon trip"},
    {id:2,icon:"mic",title:"\u201COak brackets, 30cm, matte black\u201D",meta:"Bookshelf build · voice note, 0:14",time:"18m",tag:"Bookshelf build"},
    {id:3,icon:"link",title:"Tram 28 runs every 11 minutes",meta:"Lisbon trip · from Messages",time:"1h",tag:"Lisbon trip"}
  ],
  /* Each thread opens with offload's own read of where it stands. */
  standing:{
    lisbon:{text:"Still a few things to book. You fly on Friday, and Ana can only travel the 14th to the 17th, so the dates are settled.",updated:"updated 2m ago"},
    shelf:{text:"Everything is measured and priced. The brackets are the last thing to order and the sale ends Friday, so build day is the 22nd.",updated:"updated 18m ago"},
    read:{text:"Twenty three saved, four added this week, none read. You mostly save long pieces on Sunday evenings.",updated:"updated Monday"},
    dentist:{text:"Five loose things that turned out to be one job. The insurance renewal is the only dated one, and it lapses on Monday.",updated:"updated an hour ago"},
    home:{text:"Quiet at the moment. Sam added the boiler service receipt last week, and nothing needs an answer.",updated:"updated Tuesday"},
    gifts:{text:"Eleven ideas, mostly for two people. Nothing here has a deadline until December.",updated:"updated Sunday"},
    berlin:{text:"Finished in April. Everything is still here if you want the addresses again.",updated:"updated in April"},
    bike:{text:"Went quiet in March with the new brake pads still unordered.",updated:"updated in March"},
    tax:{text:"Done and filed in January. Kept in case anything is queried.",updated:"updated in January"},
    wedding:{text:"Wrapped up last year. Forty four things, mostly photos and the seating plan.",updated:"updated last year"},
    flat:{text:"Closed last year when you signed. The inventory and the deposit receipt are the useful bits.",updated:"updated last year"}
  },
  /* People you share threads with. A person is a place you can go, not a label. */
  people:{
    Ana:{id:"Ana",name:"Ana Duarte",initials:"AD",meta:"Shares 3 threads with you",
      pending:[
        {id:"pa1",title:"Ana needs an answer on the 14th to 17th",thread:"Lisbon trip",who:"waiting on you",due:"today"},
        {id:"pa2",title:"Split the flight cost, \u20AC214 each",thread:"Lisbon trip",who:"waiting on you",due:"2d late"},
        {id:"pa3",title:"Ana is booking the Alfama flat",thread:"Lisbon trip",who:"waiting on Ana",due:""}
      ],
      shared:[{id:"lisbon",name:"Lisbon trip",meta:"14 things · active"},{id:"berlin",name:"Berlin, March",meta:"31 things · finished"},{id:"wedding",name:"Sam's wedding",meta:"44 things · finished"}]},
    Tom:{id:"Tom",name:"Tom Reilly",initials:"TR",meta:"Shares 1 thread with you",
      pending:[{id:"pt1",title:"Tom hasn't answered about the flat",thread:"Lisbon trip",who:"waiting on Tom",due:"asked twice"}],
      shared:[{id:"lisbon",name:"Lisbon trip",meta:"14 things · active"}]},
    Sam:{id:"Sam",name:"Sam Ibekwe",initials:"SO",meta:"Shares 2 threads with you",
      pending:[{id:"ps1",title:"Return Sam's drill",thread:"Bookshelf build",who:"waiting on you",due:""}],
      shared:[{id:"home",name:"Flat admin",meta:"6 things · active"},{id:"wedding",name:"Sam's wedding",meta:"44 things · finished"}]}
  },
  /* Which widgets each thread earns, and their data. A thread renders only what
     its own contents justify: Lisbon has places and dated steps, the bookshelf
     has assets and a sequence, Read later has neither. */
  widgets:{
    lisbon:["map","timeline"],
    shelf:["files","timeline"],
    berlin:["map","files"]
  },
  map:{
    lisbon:{
      filters:[{id:"all",label:"All",count:6},{id:"alfama",label:"Alfama",count:3},{id:"graca",label:"Gra\u00e7a",count:2},
        {id:"food",label:"Food",count:3,derived:true},{id:"views",label:"Views",count:2,derived:true}],
      places:[
        {id:"p1",name:"Miradouro da Senhora do Monte",meta:"viewpoint · from Safari",time:"2m",x:30,y:40,tone:"ink",tags:["graca","views"]},
        {id:"p2",name:"Time Out Market",meta:"Ana suggested this",time:"Tue",x:52,y:66,tone:"accent",tags:["food"]},
        {id:"p3",name:"Alfama flat",meta:"not booked yet",time:"Mon",x:70,y:34,tone:"attention",tags:["alfama"]},
        {id:"p4",name:"Tram 28 stop",meta:"every 11 minutes",time:"1h",x:44,y:78,tone:"ink",tags:["alfama"]},
        {id:"p5",name:"Taberna da S\u00e9",meta:"Tom found it",time:"Tue",x:62,y:52,tone:"ink",tags:["alfama","food"]},
        {id:"p6",name:"Castelo viewpoint",meta:"free before 10am",time:"Sun",x:38,y:58,tone:"ink",tags:["graca","views","food"]}
      ]},
    berlin:{
      filters:[{id:"all",label:"All",count:3},{id:"mitte",label:"Mitte",count:2},{id:"food",label:"Food",count:1,derived:true}],
      places:[
        {id:"b1",name:"Tempelhofer Feld",meta:"you walked here twice",time:"April",x:34,y:46,tone:"ink",tags:["mitte"]},
        {id:"b2",name:"Markthalle Neun",meta:"Ana's pick",time:"April",x:66,y:38,tone:"accent",tags:["food","mitte"]},
        {id:"b3",name:"Flat on Weserstra\u00dfe",meta:"where you stayed",time:"April",x:52,y:70,tone:"ink",tags:[]}
      ]}
  },
  /* ONE dated list per thread. Overall groups it by day, Daily filters it by the
     selected date, and the rail counts its dots, so the views cannot drift. */
  timeline:{
    lisbon:{granularity:"week",items:[
      {title:"Ana confirmed the 14th to 17th",date:"2026-08-10",time:"09:40",state:"done"},
      {title:"Called the flat, no answer",date:"2026-08-10",time:"14:20",state:"done"},
      {title:"Flight out, TP1234",date:"2026-08-14",time:"09:20",state:"next"},
      {title:"Alfama flat check in",date:"2026-08-14",time:"14:00"},
      {title:"Dinner with Ana",date:"2026-08-14",time:"20:00"},
      {title:"Tram 28 and the castle",date:"2026-08-15",time:"10:00"},
      {title:"Flight home",date:"2026-08-17",time:"21:05"}
    ]},
    shelf:{granularity:"hour",items:[
      {title:"Measured the alcove",date:"2026-08-09",state:"done"},
      {title:"Ordered the boards",date:"2026-08-10",state:"done"},
      {title:"Order the oak brackets",date:"2026-08-13",state:"next"},
      {title:"Brackets arrive",date:"2026-08-20"},
      {title:"Timber yard opens",date:"2026-08-22",time:"08:00"},
      {title:"Cut the boards",date:"2026-08-22",time:"10:30"},
      {title:"First bracket in",date:"2026-08-22",time:"14:00"},
      {title:"Second coat of oil",date:"2026-08-23",time:"11:00"}
    ]}
  },
  files:{
    shelf:{
      filters:[{id:"all",label:"All",count:9},{id:"photo",label:"Photos",count:5},{id:"pdf",label:"PDFs",count:2},
        {id:"link",label:"Links",count:2},{id:"brackets",label:"Brackets",count:3,derived:true},{id:"receipt",label:"Receipts",count:2,derived:true}],
      files:[
        {id:"f1",preview:true,icon:"image",tags:["photo"]},
        {id:"f2",preview:true,icon:"image",tags:["photo","brackets"]},
        {id:"f3",preview:true,icon:"image",tags:["photo","brackets"]},
        {id:"f4",preview:false,icon:"paperclip",tags:["pdf","receipt"]},
        {id:"f5",preview:false,icon:"link",tags:["link"]},
        {id:"f6",preview:true,icon:"image",tags:["photo"]},
        {id:"f7",preview:false,icon:"paperclip",tags:["pdf","receipt","brackets"]},
        {id:"f8",preview:false,icon:"link",tags:["link"]},
        {id:"f9",preview:true,icon:"image",tags:["photo"]}
      ]},
    berlin:{
      filters:[{id:"all",label:"All",count:6},{id:"photo",label:"Photos",count:4},{id:"pdf",label:"PDFs",count:2}],
      files:[
        {id:"g1",preview:true,icon:"image",tags:["photo"]},{id:"g2",preview:true,icon:"image",tags:["photo"]},
        {id:"g3",preview:true,icon:"image",tags:["photo"]},{id:"g4",preview:false,icon:"paperclip",tags:["pdf"]},
        {id:"g5",preview:true,icon:"image",tags:["photo"]},{id:"g6",preview:false,icon:"paperclip",tags:["pdf"]}
      ]}
  },
  /* Per-thread contents. Threads without an entry render an honest empty state
     rather than borrowing another thread's rows. */
  contents:{
    shelf:{notes:[
      {id:41,icon:"mic",title:"\u201COak brackets, 30cm, matte black\u201D",meta:"you · 18m"},
      {id:42,icon:"image",title:"Screenshot of the shelf dimensions",meta:"you · Tue"},
      {id:43,icon:"bookmark",title:"Walnut vs oak, price per metre",meta:"you · Sun"}],
     tasks:[
      {id:51,label:"Order the oak brackets",meta:"sale ends Friday",done:false},
      {id:52,label:"Measure the alcove again",meta:"added Sunday",done:true},
      {id:53,label:"Return Sam's drill",meta:"borrowed two weeks ago",done:false}]},
    berlin:{notes:[
      {id:71,icon:"map-pin",title:"Tempelhofer Feld",meta:"you · April"},
      {id:72,icon:"image",title:"Six photos from the last day",meta:"Ana · April"},
      {id:73,icon:"paperclip",title:"Flat inventory, signed",meta:"you · April"}],
     tasks:[]},
    read:{notes:[
      {id:61,icon:"link",title:"Why nobody finishes their reading list",meta:"from Safari · Mon"},
      {id:62,icon:"link",title:"The case for shorter books",meta:"from Messages · Sun"},
      {id:63,icon:"bookmark",title:"Three essays on attention",meta:"from Safari · last week"}],
     tasks:[]}
  },
  lisbon:{
    notes:[
      {id:11,icon:"map-pin",title:"Miradouro da Senhora do Monte",meta:"you · 2m"},
      {id:12,icon:"link",title:"Tram 28 runs every 11 minutes",meta:"you · 1h"},
      {id:13,icon:"users",title:"Ana can only do the 14th\u201317th",meta:"Ana · Tue"},
      {id:14,icon:"image",title:"Two photos of the Alfama flat",meta:"Tom · Mon"}
    ],
    tasks:[
      {id:21,label:"Book the Alfama flat",meta:"Ana is waiting on this",done:false},
      {id:22,label:"Check passport expiry",meta:"added Monday",done:true},
      {id:23,label:"Split the flight cost",meta:"\u20AC214 each",done:false}
    ]
  },
  /* Memories. A memory is a subject offload holds an opinion about: it opens into
     what it knows, and where it learned it. Groups are kinds of knowledge, not topics. */
  memories:{
    total:34,
    groups:[
      {label:"Going on",tone:"fill",items:["lisbon-aug","bookshelf","insurance","dentist"]},
      {label:"People",tone:"fill",dot:true,items:["ana","tom","sam"]},
      {label:"How you like things",tone:"outline",items:["quiet-hours","metric","no-digest","week-monday"]},
      {label:"Noticed",tone:"accent",items:["fridays","reading-later"]}
    ],
    items:{
      "lisbon-aug":{label:"Lisbon in August",group:"Going on",updated:"2m ago",
        blurb:"You are going to Lisbon for four days in August with Ana and, probably, Tom. The flight is booked for Friday the 14th at 09:20 and Ana can only travel until the 17th, so the dates are settled either way. Where you sleep is not: the Alfama flat is the one you both liked and nobody has booked it. You still owe Ana \u20AC214 for the flight.",
        sources:[
          {icon:"message-circle",title:"Ana: \u201CI can only do the 14th to the 17th\u201D",meta:"you forwarded this on Tuesday"},
          {icon:"inbox",title:"Flight confirmation, TP1234",meta:"email, 2 Aug"},
          {icon:"image",title:"alfama-flat.png",meta:"you saved this, 28 Jul"},
          {icon:"mic",title:"Voice note, 0:41",meta:"\u201Cask Tom if he is actually coming\u201D"}
        ],
        related:["ana","tom","metric"],threads:[{id:"lisbon",name:"Lisbon trip",meta:"14 things \u00B7 active"}]},
      "bookshelf":{label:"the bookshelf",group:"Going on",updated:"Tue",
        blurb:"An alcove shelf in the front room, 210cm by 76cm, in oak. You picked matte black brackets at 30cm and haven't ordered them; the sale ends Friday. Sam's drill is still at yours.",
        sources:[
          {icon:"image",title:"shelf-brackets.png",meta:"you saved this, 6 Aug"},
          {icon:"scan-text",title:"Measurements, written down",meta:"you typed this, 3 Aug"}
        ],
        related:["sam"],threads:[{id:"shelf",name:"Bookshelf build",meta:"9 things \u00B7 active"}]},
      "insurance":{label:"flat insurance",group:"Going on",updated:"Mon",
        blurb:"The flat policy renews on the 20th and the renewal quote went up by \u00A340 a year. You said you would check two other quotes before letting it roll over.",
        sources:[{icon:"inbox",title:"Renewal notice",meta:"email you dumped, 4 Aug"}],
        related:["sam"],threads:[{id:"home",name:"Flat admin",meta:"6 things \u00B7 active"}]},
      "dentist":{label:"dentist",group:"Going on",updated:"Jul",
        blurb:"You haven't booked the check up you meant to book in June. The surgery only takes calls, and only before 5pm, which is the reason it keeps slipping.",
        sources:[{icon:"mic",title:"Voice note, 0:06",meta:"\u201Ccall the dentist back\u201D"}],
        related:["fridays"],threads:[{id:"home",name:"Flat admin",meta:"6 things \u00B7 active"}]},
      "ana":{label:"Ana",group:"People",person:"Ana",updated:"2m ago",
        blurb:"Ana Duarte. You share three things with her, and Lisbon is the live one. She answers in the evenings, rarely the same hour you ask, and she is the one waiting on you twice right now.",
        sources:[{icon:"message-circle",title:"Ana: \u201CI can only do the 14th to the 17th\u201D",meta:"Tuesday"},{icon:"users",title:"Berlin, March",meta:"31 things, finished"}],
        related:["lisbon-aug"],threads:[{id:"lisbon",name:"Lisbon trip",meta:"14 things \u00B7 active"}]},
      "tom":{label:"Tom",group:"People",person:"Tom",updated:"Fri",
        blurb:"Tom Reilly. Asked twice about Lisbon and hasn't answered either time. You have started planning as though he isn't coming.",
        sources:[{icon:"message-circle",title:"You asked Tom about the flat",meta:"twice, 1 Aug and 7 Aug"}],
        related:["lisbon-aug"],threads:[{id:"lisbon",name:"Lisbon trip",meta:"14 things \u00B7 active"}]},
      "sam":{label:"Sam",group:"People",person:"Sam",updated:"Jun",
        blurb:"Sam Ibekwe. Lives two streets away, lends you tools, and is the reason the wedding thread is the biggest one you have. His drill is still at yours.",
        sources:[{icon:"users",title:"Sam's wedding",meta:"44 things, finished"}],
        related:["bookshelf"],threads:[{id:"home",name:"Flat admin",meta:"6 things \u00B7 active"}]},
      "quiet-hours":{label:"quiet after 22:00",group:"How you like things",updated:"Jun",
        blurb:"Nothing reaches you after ten at night. You set this yourself in June and haven't changed it since.",
        sources:[{icon:"settings",title:"You set this",meta:"14 Jun"}],related:["no-digest"],threads:[]},
      "metric":{label:"metric",group:"How you like things",updated:"May",
        blurb:"Distances in kilometres, temperature in celsius, dates day first.",
        sources:[{icon:"settings",title:"You set this",meta:"2 May"}],related:["week-monday"],threads:[]},
      "no-digest":{label:"no email digests",group:"How you like things",updated:"Jul",
        blurb:"You turned the weekly email off in July and asked not to be asked again.",
        sources:[{icon:"message-circle",title:"\u201CTurn off the weekly email\u201D",meta:"you asked offload, 9 Jul"}],
        related:["quiet-hours"],threads:[]},
      "week-monday":{label:"week starts Monday",group:"How you like things",updated:"May",
        blurb:"Calendars, rails and week counts all start on Monday.",
        sources:[{icon:"settings",title:"You set this",meta:"2 May"}],related:["metric"],threads:[]},
      "fridays":{label:"you put things off on Fridays",group:"Noticed",inferred:true,updated:"1w ago",
        blurb:"Things you plan for a Friday move to the following week more often than not. Eleven of the last seventeen. offload noticed this, you didn't tell it.",
        sources:[{icon:"sparkles",title:"Noticed across 17 tasks",meta:"since March"}],
        related:["dentist"],threads:[]},
      "reading-later":{label:"you never open reading later",group:"Noticed",inferred:true,updated:"3w ago",
        blurb:"Twenty three saved articles, four opened. The ones you do open are the ones somebody sent you.",
        sources:[{icon:"sparkles",title:"Noticed in Read later",meta:"23 saved, 4 opened"}],
        related:[],threads:[{id:"reading",name:"Read later",meta:"23 things \u00B7 ongoing"}]}
    },
    conversations:[
      {label:"This week",rows:[
        {id:"c1",title:"What do I still owe money for?",meta:"3 answers \u00B7 Lisbon trip, Flat admin",when:"2m"},
        {id:"c2",title:"Everything about the bookshelf",meta:"offload listed 9 things",when:"Tue"},
        {id:"c3",title:"What did Ana say about dates?",meta:"the 14th to the 17th",when:"Mon"}
      ]},
      {label:"Earlier",rows:[
        {id:"c4",title:"Turn off the weekly email",meta:"settings \u00B7 done",when:"Jul"},
        {id:"c5",title:"Which brackets did I pick?",meta:"matte black, 30cm",when:"Jul"},
        {id:"c6",title:"When did Sam lend me the drill?",meta:"the weekend before last",when:"Jul"},
        {id:"c7",title:"What is left before Lisbon?",meta:"offload listed 5 things",when:"Jul"},
        {id:"c8",title:"Delete the old Berlin thread",meta:"kept it, you changed your mind",when:"Jun"},
        {id:"c9",title:"Everything Ana is waiting on",meta:"2 things",when:"Jun"},
        {id:"c10",title:"Where did I save the flat photos?",meta:"Flat admin, 12 images",when:"Jun"}
      ]}
    ],
    /* Each conversation keeps its turns, so reopening one puts you back in context. */
    turns:{
      c1:[
        {from:"you",text:"What do I still owe money for?"},
        {from:"offload",text:"Three things. Ana paid for both Lisbon flights, so you owe her \u20AC214. Sam covered the drill bits, \u00A312. And the flat insurance renews on the 20th at \u00A3340, which is \u00A340 more than last year.",
          refs:[{id:"lisbon",name:"Lisbon trip"},{id:"home",name:"Flat admin"},
            {id:"m1",kind:"money",name:"\u20AC214 to Ana"},{id:"t1",kind:"time",name:"the 20th"}]},
        {from:"you",text:"remind me about Ana on Friday",status:"done"},
        {from:"you",text:"delete the dentist reminder",status:"done"}
      ],
      c2:[
        {from:"you",text:"Everything about the bookshelf"},
        {from:"offload",text:"Nine things. The alcove is 210cm by 76cm and you settled on oak. Brackets are matte black at 30cm, not ordered, and the sale ends Friday. Sam's drill is at yours. You saved two price comparisons and a photo of the brackets.",
          refs:[{id:"shelf",name:"Bookshelf build"},{id:"m2",kind:"money",name:"\u00A312 to Sam"}]},
        {from:"you",text:"order the brackets tomorrow",status:"seen"}
      ],
      c3:[
        {from:"you",text:"What did Ana say about dates?"},
        {from:"offload",text:"She can only travel the 14th to the 17th. She said it on Tuesday evening, and you forwarded it to me the same night.",
          refs:[{id:"lisbon",name:"Lisbon trip"}]}
      ],
      c4:[
        {from:"you",text:"Turn off the weekly email"},
        {from:"offload",text:"Done. No more weekly digests, and won't ask again."}
      ],
      c6:[{from:"you",text:"When did Sam lend me the drill?"},
        {from:"offload",text:"The weekend before last, the 1st. It is still at yours.",refs:[{id:"shelf",name:"Bookshelf build"}]}],
      c7:[{from:"you",text:"What is left before Lisbon?"},
        {from:"offload",text:"Five things. Book the Alfama flat, pay Ana back, ask Tom one more time, check your passport, and print nothing because Ana has the tickets.",
          refs:[{id:"lisbon",name:"Lisbon trip"},{id:"m3",kind:"money",name:"\u20AC214 to Ana"}]}],
      c8:[{from:"you",text:"Delete the old Berlin thread"},
        {from:"you",text:"actually keep it",status:"done"}],
      c9:[{from:"you",text:"Everything Ana is waiting on"},
        {from:"offload",text:"Two. The dates, which she asked about on Tuesday, and the \u20AC214.",refs:[{id:"lisbon",name:"Lisbon trip"}]}],
      c10:[{from:"you",text:"Where did I save the flat photos?"},
        {from:"offload",text:"Flat admin, twelve images, most of them from the survey in June.",refs:[{id:"home",name:"Flat admin"}]}],
      c5:[
        {from:"you",text:"Which brackets did I pick?"},
        {from:"offload",text:"Matte black, 30cm. You compared them against the brushed steel ones on the 6th and picked these on price.",
          refs:[{id:"shelf",name:"Bookshelf build"}]}
      ]
    },
    conversationTotal:12,
  },
  /* What offload interrupts you for. Grouped by who caused it: someone else, a
     deadline, or offload itself. */
  notifications:[
    {id:"n1",kind:"person",who:"Ana",initials:"AD",icon:"message-circle",unread:true,
      title:"Ana answered about the dates",body:"\u201CThe 14th to the 17th works, book it\u201D",thread:"Lisbon trip",when:"2m"},
    {id:"n2",kind:"due",icon:"clock",unread:true,
      title:"The bracket sale ends Friday",body:"You saved these on the 6th and haven't ordered them.",thread:"Bookshelf build",when:"1h"},
    {id:"n3",kind:"offload",icon:"sparkles",unread:true,
      title:"Filed four things from yesterday",body:"Two into Lisbon trip, one into Flat admin, one that couldn't be placed.",thread:null,when:"3h"},
    {id:"n4",kind:"person",who:"Sam",initials:"SO",icon:"users",unread:true,
      title:"Sam added three photos",body:"Survey shots of the back wall.",thread:"Flat admin",when:"Yesterday"},
    {id:"n5",kind:"due",icon:"clock",unread:false,
      title:"Flat insurance renews on the 20th",body:"\u00A3340, up \u00A340 from last year.",thread:"Flat admin",when:"Mon"},
    {id:"n6",kind:"offload",icon:"cloudy",unread:false,
      title:"Noticed you put things off on Fridays",body:"Eleven of the last seventeen moved to the following week.",thread:null,when:"Sun"},
    {id:"n7",kind:"person",who:"Tom",initials:"TR",icon:"message-circle",unread:false,
      title:"Tom still hasn't answered",body:"You asked twice about Lisbon.",thread:"Lisbon trip",when:"Sun"}
  ],
  today_view:{
    nudges:[
      {icon:"cloud-rain",text:"Take a coat, it looks like rain around 3pm."},
      {icon:"clock",text:"You have three free hours after lunch."},
      {icon:"users",text:"Ana usually replies in the evening."},
      {icon:"sun",text:"Sunset is at 8:14, if the walk is still on."},
      {icon:"archive",text:"Nine things from last week are still unfiled."},
      {icon:"bookmark",text:"You saved four articles and read none of them."},
      {icon:"calendar",text:"Nothing in the diary tomorrow morning."}
    ],
    priority:[
      {id:"p1",icon:"users",tone:"attention",person:"Ana",title:"Ana needs an answer on the 14th\u201317th",thread:"Lisbon trip",meta:"asked Tuesday",due:"today"},
      {id:"p2",icon:"clock",tone:"attention",title:"Split the flight cost: \u20AC214 each",thread:"Lisbon trip",meta:"you said you'd sort it",due:"2d late"},
      {id:"p3",icon:"square-check-big",tone:"neutral",title:"Order the oak brackets before the sale ends",thread:"Bookshelf build",meta:"sale ends Friday",due:"Fri"},
      {id:"p4",icon:"lock",tone:"neutral",title:"Renew the flat insurance",thread:"Flat admin",meta:"from an email you dumped",due:"Mon"},
      {id:"p5",icon:"clock",tone:"neutral",title:"Call the dentist back after the 20th",thread:"Flat admin",meta:"voice note, 0:06",due:"20th"},
      {id:"p6",icon:"users",tone:"neutral",person:"Tom",title:"Reply to Tom about the Alfama flat",thread:"Lisbon trip",meta:"he asked twice",due:""},
      {id:"p7",icon:"users",tone:"neutral",person:"Sam",title:"Return the drill you borrowed",thread:"Bookshelf build",meta:"from Sam",due:""},
      {id:"p8",icon:"calendar",tone:"neutral",title:"Book the hostel for the 15th",thread:"Lisbon trip",meta:"prices rising",due:""}
    ],
    threads:[
      {id:"lisbon",name:"Lisbon trip",added:3,lines:[
        {icon:"map-pin",text:"Miradouro da Senhora do Monte",time:"2m"},
        {icon:"link",text:"Tram 28 runs every 11 minutes",time:"1h"},
        {icon:"users",text:"Ana can only do the 14th\u201317th",time:"Tue"}]},
      {id:"shelf",name:"Bookshelf build",added:2,lines:[
        {icon:"mic",text:"\u201COak brackets, 30cm, matte black\u201D",time:"18m"},
        {icon:"image",text:"Screenshot of the shelf dimensions",time:"Tue"}]}
    ],
    days:[
      {label:"Today",date:fmt(TODAY),isToday:true,events:[
        {title:"Standup",start:9.5,end:10,tone:"ink"},
        {title:"Call with Ana",start:12,end:12.5,tone:"attention"},
        {title:"Timber yard closes",start:17,end:17.5,tone:"accent"},
        {title:"Dinner, Sam",start:19.5,end:21,tone:"ink"}]},
      {label:"Tomorrow",date:fmt(plusDays(TODAY,1)),isToday:false,events:[
        {title:"Dentist",start:8.5,end:9.5,tone:"ink"},
        {title:"Brackets arrive",start:14,end:15,tone:"accent"},
        {title:"Flat viewing",start:18,end:19,tone:"attention"}]}
    ],
    other:[
      {id:"o1",icon:"link",title:"Why nobody finishes their reading list",meta:"Read later · from Safari",time:"Mon"},
      {id:"o2",icon:"image",title:"Three shelf photos from Sam",meta:"Bookshelf build",time:"Mon"},
      {id:"o3",icon:"bookmark",title:"Walnut vs oak, price per metre",meta:"Bookshelf build · from Safari",time:"Sun"}
    ]
  }
};
})();


/* 013 answering. One reply, plus results: a result is one read, so two subjects is two
   results. Rows are whole content rows, the same ones a thread page draws. Nothing here
   is filed: asking files nothing. */
window.OFFLOAD_DATA.answers={
  open:{text:"Seven left.",results:[{thread:{id:"lisbon",name:"Lisbon trip"},count:7,rows:[
    {id:"an1",title:"Book the airport transfer",meta:"you, added 6 Aug"},
    {id:"an2",title:"Pay Ana \u20AC214 for the flights",meta:"Ana, due Thursday"},
    {id:"an3",title:"Print the boarding passes",meta:"you, added yesterday"},
    {id:"an4",title:"Confirm the Alfama key handover",meta:"Ana, added 7 Aug"},
    {id:"an5",title:"Renew the travel insurance",meta:"you, added 8 Aug"},
    {id:"an6",title:"Download the offline map",meta:"you, added 9 Aug"},
    {id:"an7",title:"Ask Tom about the tram pass",meta:"Tom, added 9 Aug"}]}]},
  staying:{text:"The Alfama flat, 14th to the 17th.",results:[{thread:{id:"lisbon",name:"Lisbon trip"},count:1,tickable:false,rows:[
    {id:"anf",type:"location",title:"Alfama flat, Rua dos Rem\u00E9dios 14",meta:"Ana booked it, 4 Aug"}]}]},
  /* A read that was cut short says what it saw and claims nothing about the rest: a wrong
     no is somebody doing the thing twice. The tail is the thread, not a Show more. */
  cutShort:{text:"Looked at the first twenty of twenty three things, and nothing about knife sharpening is among them.",
    results:[{thread:{id:"read",name:"Read later"},count:"20 of 23",truncated:true,threadTotal:3,tickable:false,rows:[
      {id:"anr1",type:"link",title:"The case for a single good knife",meta:"saved 2 Sep"},
      {id:"anr2",type:"link",title:"Cast iron, and how not to ruin it",meta:"saved 30 Aug"}]}]},
  /* A proposal: one primary, one plain way out. Exactly 012's shape. */
  butter:{text:"No, butter isn't on the list. Add it?",
    options:[{id:"yes",label:"Add it",kind:"primary"},{id:"no",label:"No",kind:"plain"}]},
  /* A choice among equals has no primary, because offload does not know which. */
  which:{text:"Three threads have a trip in them. Which one?",note:"Or name another one.",
    options:[{id:"lisbon",label:"Lisbon trip",kind:"thread",icon:"lasso"},
      {id:"berlin",label:"Berlin, March",kind:"thread",icon:"lasso"},
      {id:"wedding",label:"Sam's wedding",kind:"thread",icon:"lasso"}]},
  /* Not answerable, and saying so is the honest answer rather than a gap. */
  theme:{text:"Theme is set on this phone and was never held on the server."},
  nothing:{text:"Couldn't find that."}
};

/* 016 reaching the web. A turn carries sources:[{domain,url}] and nothing else, so the
   footer draws a domain from the record of what was read rather than a word a page chose.
   The cases live in each kit's answerFor, where typing can reach them: "when is memorial
   day" for one source, "what's on over the long weekend" for five and a count, a pasted URL
   for a read that failed and says nothing, "what day is the gun show" for a refusal with
   nothing to file. */

