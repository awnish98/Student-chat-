const express=require("express"),http=require("http"),{Server}=require("socket.io"),path=require("path");
const app=express(),server=http.createServer(app),io=new Server(server);
const path = require("path");

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(__dirname, "style.css"));
});

app.get("/app.js", (req, res) => {
  res.sendFile(path.join(__dirname, "app.js"));
});
const rooms=new Map(),MAX=12;
const clean=(s,n)=>String(s||"").replace(/[\u0000-\u001f\u007f]/g,"").trim().slice(0,n);
io.on("connection",s=>{
 s.on("join-room",({roomCode,displayName},cb=()=>{})=>{
  const r=clean(roomCode,12).toUpperCase(),name=clean(displayName,24);
  if(!/^[A-Z0-9-]{4,12}$/.test(r)||name.length<2)return cb({ok:false,error:"Enter a name and a 4–12 character room code."});
  if(!rooms.has(r))rooms.set(r,new Map());const m=rooms.get(r);
  if(m.size>=MAX&&!m.has(s.id))return cb({ok:false,error:"Room is full (12 people maximum)."});
  if(s.data.room)s.leave(s.data.room);
  s.data.room=r;s.data.name=name;s.join(r);m.set(s.id,name);
  io.to(r).emit("members",[...m].map(([id,name])=>({id,name})));
  s.to(r).emit("system-message",name+" joined the room.");cb({ok:true,roomCode:r});
 });
 s.on("chat-message",raw=>{const r=s.data.room,msg=clean(raw,600);if(!r||!msg)return;io.to(r).emit("chat-message",{name:s.data.name,message:msg});});
 s.on("meeting-signal",p=>{if(s.data.room&&p&&typeof p.to==="string"&&rooms.get(s.data.room)?.has(p.to))io.to(p.to).emit("meeting-signal",{from:s.id,description:p.description,candidate:p.candidate});});
 s.on("disconnect",()=>{const r=s.data.room;if(r){rooms.get(r)?.delete(s.id);s.to(r).emit("system-message",(s.data.name||"Someone")+" left.");io.to(r).emit("members",[...(rooms.get(r)||[])].map(([id,name])=>({id,name})));}});
});
server.listen(process.env.PORT||3000,()=>console.log("AWNISH CHAT ready"));
