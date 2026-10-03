/* Mock data for the admin panel, as built in 034. Same people as the app's `data.js` where they
   overlap. Money is in dollars to the cent; caps are over the last 24 hours, rolling. */
window.ADMIN_DATA={
  today:"Sat 3 Oct",
  me:{email:"hana@offload.app",role:"owner"},
  waitlist:{waiting:1284,invitedThisWeek:25,accepted:19,batch:25,
    rows:[
      {id:"w1",email:"priya.raman@gmail.com",joined:"2 Oct",source:"offload.app",status:"waiting",note:""},
      {id:"w2",email:"j.okonkwo@hey.com",joined:"2 Oct",source:"offload.app",status:"waiting",note:""},
      {id:"w3",email:"m.lindqvist@fastmail.com",joined:"1 Oct",source:"offload.app",status:"waiting",note:""},
      {id:"w4",email:"tomas@duarte.pt",joined:"1 Oct",source:"shared thread",status:"waiting",note:"Ana Duarte asked for him"},
      {id:"w5",email:"h.mbeki@outlook.com",joined:"30 Sep",source:"offload.app",status:"waiting",note:""},
      {id:"w6",email:"clara.ferreira@gmail.com",joined:"29 Sep",source:"offload.app",status:"invited",note:"invited 30 Sep, not accepted"},
      {id:"w7",email:"d.whitfield@me.com",joined:"28 Sep",source:"invited by address",status:"invited",note:"invited 29 Sep, not accepted"},
      {id:"w8",email:"s.nakamura@gmail.com",joined:"27 Sep",source:"offload.app",status:"accepted",note:"signed in 28 Sep"},
      {id:"w9",email:"noreply@bot-farm.xyz",joined:"26 Sep",source:"offload.app",status:"waiting",note:"looks automated"}
    ]},
  users:[
    {id:"u1",name:"Ana Duarte",email:"ana@duarte.pt",provider:"Apple",joined:"4 Mar",threads:12,active:"2h ago",spend:4.82,status:"active"},
    {id:"u2",name:"Tom Reilly",email:"tom@reilly.co",provider:"Google",joined:"11 Mar",threads:4,active:"yesterday",spend:1.94,status:"active"},
    {id:"u3",name:"Sam Ibekwe",email:"sam.ibekwe@gmail.com",provider:"Google",joined:"2 Apr",threads:9,active:"4d ago",spend:2.61,status:"active"},
    {id:"u4",name:"Jo Bailey",email:"jo@hey.com",provider:"Apple",joined:"9 Apr",threads:21,active:"12m ago",spend:11.40,status:"active"},
    {id:"u5",name:"Nadia Haddad",email:"nadia@haddad.dev",provider:"Google",joined:"1 May",threads:6,active:"3d ago",spend:3.05,status:"deleting",deleteAt:"4 Oct, 14:05"},
    {id:"u6",name:"Kit Marlow",email:"kit@marlow.studio",provider:"Apple",joined:"18 May",threads:2,active:"5w ago",spend:0.42,status:"disabled"},
    {id:"u7",name:"Bea Lindqvist",email:"bea@lindqvist.se",provider:"Google",joined:"2 Jun",threads:14,active:"1h ago",spend:9.88,status:"active"},
    {id:"u8",name:"Owen Pryce",email:"owen.pryce@gmail.com",provider:"Google",joined:"20 Jun",threads:31,active:"just now",spend:38.17,status:"active"},
    {id:"u9",name:"Ines Ferreira",email:"ines@ferreira.pt",provider:"Apple",joined:"4 Jul",threads:7,active:"6d ago",spend:2.20,status:"active"}
  ],
  person:{
    caps:[["Spend","$1.84","$2.50"],["Turns","61","100"],["Photos","12","40"],["Photo MB","38","200"],["Voice notes","4","30"],["Voice minutes","9","60"],["Mail","2","20"]],
    has:[["Threads","31"],["Rows","1,412"],["Notes","88"],["Photos","206"],["Shared threads","3"]],
    spend:[1.1,2.4,1.9,3.2,2.1,2.8,1.6,2.9,3.4,2.2,1.8,2.6,3.1,2.5],
    turns:[40,72,61,90,58,81,44,77,96,63,52,70,88,61],
    jobs:[
      {when:"20:41",kind:"turn",code:"",model:"claude-haiku-4-5",tokens:"3.1k",ms:"1.9s",cost:"$0.004",state:"done"},
      {when:"20:38",kind:"photo",code:"",model:"claude-sonnet-4-5",tokens:"6.8k",ms:"4.2s",cost:"$0.031",state:"done"},
      {when:"19:10",kind:"turn",code:"cap.turns",model:"",tokens:"",ms:"",cost:"",state:"failed"},
      {when:"18:02",kind:"mail",code:"",model:"claude-haiku-4-5",tokens:"2.4k",ms:"2.2s",cost:"$0.003",state:"done"}
    ],
    hits:[{day:"2 Oct",cap:"Turns",whose:"theirs",n:3},{day:"28 Sep",cap:"Spend",whose:"theirs",n:1}]
  },
  costs:{
    range:"Last 30 days",spend:1842.60,budget:2500,lastMonth:1613.20,perUserAvg:1.42,accounts:1297,
    days:[52,61,58,74,66,71,88,79,64,60,73,81,92,86,70,68,77,84,90,83,75,79,86,94,88,72,69,80,91,85],
    usage:[31,34,33,40,37,39,45,43,36,35,40,44,48,46,39,38,42,45,47,44,41,43,46,49,47,40,39,44,48,46],
    byFeature:[
      {name:"Sorting what people dump",spend:812.40,calls:"1.9M"},
      {name:"Answers in the composer",spend:521.10,calls:"148k"},
      {name:"Notes",spend:298.70,calls:"62k"},
      {name:"Standing blurbs on threads",spend:141.30,calls:"39k"},
      {name:"Notification wording",spend:69.10,calls:"210k"}
    ],
    byModel:[
      {name:"claude-haiku-4-5",calls:"2.2M",tokens:"4.1B",spend:1021.30},
      {name:"claude-sonnet-4-5",calls:"171k",tokens:"0.9B",spend:788.40},
      {name:"whisper-1",calls:"38k",tokens:"6.1k min",spend:32.90}
    ],
    byVendor:[
      {name:"Anthropic",metered:1809.70,billed:1812.04,how:"billed"},
      {name:"OpenAI",metered:32.90,billed:32.90,how:"billed"},
      {name:"Google Maps",metered:null,billed:200.00,how:"typed"},
      {name:"Resend",metered:null,billed:20.00,how:"typed"}
    ]
  },
  limits:{
    person:[["Spend","2.50","$"],["Turns","100",""],["Photos","40",""],["Photo megabytes","200","MB"],["Voice notes","30",""],["Voice minutes","60","min"],["Mail","20",""]],
    platform:[["Spend, everyone","120.00","$"]],
    month:[["Monthly budget","2500","$"],["Google Maps","200.00","$"],["Resend","20.00","$"]],
    batch:"25",
    switches:[["Answers",true],["Photos",true],["Voice notes",true],["Mail in",true],["Reaching the web",false]],
    hits:[
      {day:"2 Oct",cap:"Turns",whose:"Owen Pryce",n:3},
      {day:"28 Sep",cap:"Spend",whose:"Owen Pryce",n:1},
      {day:"18 Sep",cap:"Spend, everyone",whose:"the platform",n:1}
    ]
  },
  health:{
    services:[["API","up","99.98%"],["Workers","up","99.95%"],["Database","up","100%"],["Mail in","late","99.41%"]],
    queue:{waiting:14,running:6,oldest:"38s"},
    stuck:[{id:"j91",kind:"mail",who:"Jo Bailey",since:"19:02",state:"stuck"},{id:"j77",kind:"photo",who:"Bea Lindqvist",since:"yesterday",state:"dead"}],
    scheduled:[["Morning message","07:00 local","done"],["Evening message","19:30 local","done"],["Calendar sync","every 10 min","running"],["Backup","03:00 UTC","done"]]
  },
  audit:[
    {when:"20:12",who:"Hana Ito",what:"Changed Turns from 80 to 100",about:"Limits"},
    {when:"14:05",who:"Hana Ito",what:"Marked for deletion",about:"Nadia Haddad"},
    {when:"11:30",who:"Ruth Adeyemi",what:"Invited 25 from the list",about:"Waitlist"},
    {when:"Fri",who:"Femi Balogun",what:"Disabled",about:"Kit Marlow"}
  ],
  admins:[
    {id:"a1",name:"Hana Ito",email:"hana@offload.app",role:"Owner",added:"4 Mar",active:"now",you:true},
    {id:"a2",name:"Ruth Adeyemi",email:"ruth@offload.app",role:"Support",added:"18 Apr",active:"yesterday"},
    {id:"a3",name:"Femi Balogun",email:"femi@offload.app",role:"Support",added:"2 Jun",active:"3d ago"},
    {id:"a4",name:"Dev Mistry",email:"dev@offload.app",role:"Owner",added:"4 Mar",active:"2h ago"}
  ],
  roles:[
    {name:"Support",can:"Waitlist, People and a person's page"},
    {name:"Owner",can:"Also Health, Costs, Limits, Staff and Audit; the only role sent Delete, overrides and a deleted account's audit entries"}
  ]
};
