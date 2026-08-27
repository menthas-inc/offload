/* Mock data for the admin panel. Same people and threads as the app's `data.js` where they
   overlap, so a support person reading both sees one product. Money is in GBP, tokens are
   rounded, and every number is invented but plausible for a few thousand accounts. */
window.ADMIN_DATA={
  today:"Tue 25 Aug",
  waitlist:{waiting:1284,invitedThisWeek:40,accepted:31,weekly:40,
    rows:[
      {id:"w1",email:"priya.raman@gmail.com",joined:"24 Aug",source:"offload.app",status:"waiting",note:""},
      {id:"w2",email:"j.okonkwo@hey.com",joined:"24 Aug",source:"offload.app",status:"waiting",note:""},
      {id:"w3",email:"m.lindqvist@fastmail.com",joined:"23 Aug",source:"offload.app",status:"waiting",note:""},
      {id:"w4",email:"tomas@duarte.pt",joined:"23 Aug",source:"shared thread",status:"waiting",note:"Ana Duarte asked for him"},
      {id:"w5",email:"h.mbeki@outlook.com",joined:"22 Aug",source:"offload.app",status:"waiting",note:""},
      {id:"w6",email:"clara.ferreira@gmail.com",joined:"21 Aug",source:"offload.app",status:"invited",note:"invited 22 Aug, not accepted"},
      {id:"w7",email:"d.whitfield@me.com",joined:"20 Aug",source:"offload.app",status:"invited",note:"invited 21 Aug, not accepted"},
      {id:"w8",email:"s.nakamura@gmail.com",joined:"19 Aug",source:"offload.app",status:"accepted",note:"signed in 20 Aug"},
      {id:"w9",email:"noreply@bot-farm.xyz",joined:"18 Aug",source:"offload.app",status:"waiting",note:"looks automated"},
      {id:"w10",email:"r.oyelaran@proton.me",joined:"18 Aug",source:"offload.app",status:"waiting",note:""}
    ]},
  users:[
    {id:"u1",name:"Ana Duarte",email:"ana@duarte.pt",provider:"Apple",joined:"4 Mar",threads:12,active:"2h ago",spend:4.82,status:"active"},
    {id:"u2",name:"Tom Reilly",email:"tom@reilly.co",provider:"Google",joined:"11 Mar",threads:4,active:"yesterday",spend:1.94,status:"active"},
    {id:"u3",name:"Sam Ibekwe",email:"sam.ibekwe@gmail.com",provider:"Google",joined:"2 Apr",threads:9,active:"4d ago",spend:2.61,status:"active"},
    {id:"u4",name:"Jo Bailey",email:"jo@hey.com",provider:"Apple",joined:"9 Apr",threads:21,active:"12m ago",spend:11.40,status:"active"},
    {id:"u5",name:"Nadia Haddad",email:"nadia@haddad.dev",provider:"Google",joined:"1 May",threads:6,active:"3d ago",spend:3.05,status:"active"},
    {id:"u6",name:"Kit Marlow",email:"kit@marlow.studio",provider:"Apple",joined:"18 May",threads:2,active:"5w ago",spend:0.42,status:"disabled"},
    {id:"u7",name:"Bea Lindqvist",email:"bea@lindqvist.se",provider:"Google",joined:"2 Jun",threads:14,active:"1h ago",spend:9.88,status:"active"},
    {id:"u8",name:"Owen Pryce",email:"owen.pryce@gmail.com",provider:"Google",joined:"20 Jun",threads:31,active:"just now",spend:38.17,status:"active"},
    {id:"u9",name:"Ines Ferreira",email:"ines@ferreira.pt",provider:"Apple",joined:"4 Jul",threads:7,active:"6d ago",spend:2.20,status:"active"},
    {id:"u10",name:"Marcus Bell",email:"marcus@bell.io",provider:"Google",joined:"29 Jul",threads:1,active:"3w ago",spend:0.18,status:"disabled"}
  ],
  costs:{
    monthLabel:"1 to 25 August",
    spend:1842.60,budget:2500,lastMonth:1613.20,
    perUserAvg:1.42,accounts:1297,activeAccounts:892,
    byJob:[
      {name:"Sorting what people dump",spend:812.40,calls:"1.9M",note:"every dump, one small call"},
      {name:"Answers in the composer",spend:521.10,calls:"148k",note:"the expensive one, long context"},
      {name:"Memories",spend:298.70,calls:"62k",note:"runs nightly per account"},
      {name:"Standing blurbs on threads",spend:141.30,calls:"39k",note:"rewritten when a thread moves"},
      {name:"Notification wording",spend:69.10,calls:"210k",note:"cheapest model"}
    ],
    days:[52,61,58,74,66,71,88,79,64,60,73,81,92,86,70,68,77,84,90,83,75,79,86,94,88],
    topSpenders:[
      {id:"u8",name:"Owen Pryce",spend:38.17,note:"31 threads, dumps all day"},
      {id:"u4",name:"Jo Bailey",spend:11.40,note:"21 threads"},
      {id:"u7",name:"Bea Lindqvist",spend:9.88,note:"14 threads"},
      {id:"u1",name:"Ana Duarte",spend:4.82,note:"12 threads, 3 shared"}
    ]
  },
  limits:{
    platformDaily:120,platformUsed:94.20,
    userDaily:2.50,userMonthly:25,
    atCap:"Slow down",
    alertAt:80,
    alertWho:["ops@offload.app","hana@offload.app"],
    breaches:[
      {who:"Owen Pryce",when:"24 Aug",what:"hit the daily user cap at 19:10",action:"slowed for 3 hours"},
      {who:"Platform",when:"18 Aug",what:"reached 80% of the daily cap",action:"alerted ops"}
    ]
  },
  admins:[
    {id:"a1",name:"Hana Ito",email:"hana@offload.app",role:"Owner",added:"4 Mar",active:"20m ago"},
    {id:"a2",name:"Ruth Adeyemi",email:"ruth@offload.app",role:"Support",added:"18 Apr",active:"yesterday"},
    {id:"a3",name:"Femi Balogun",email:"femi@offload.app",role:"Support",added:"2 Jun",active:"3d ago"},
    {id:"a4",name:"You",email:"admin@offload.app",role:"Owner",added:"4 Mar",active:"now",you:true}
  ],
  /* Two roles, and the difference is money. Support does the day job; an owner can also see
     what the platform costs and change what it is allowed to spend. */
  roles:[
    {name:"Owner",can:"Everything, including costs, limits and who else is staff"},
    {name:"Support",can:"Waitlist and people. Cannot see costs or change limits"}
  ]
};
