
/* =========================================================
   نظام إدارة مدارس الأحد
   ========================================================= */

let DB = {settings:{schoolName:'مدرسة الأحد'}, stages:[], grades:[], classes:[], members:[], servants:[],
  attendance:[], evaluations:[], followups:[], activities:[], auditLog:[], users:[],
  paymentMethods:[], paymentProofs:[], chatMessages:[], tickets:[], plans:[]}; // ذاكرة مؤقتة تُزامَن تلقائيًا مع Firestore
let TICKET_TYPES = []; // أنواع التذاكر المتاحة (يديرها المالك)
let CURRENT_USER = null;     // logged-in user object (session only, not persisted)
let CURRENT_PAGE = 'dashboard';
let CURRENT_PARAM = undefined;
let CURRENT_MEMBER_TAB = 'overview';

/* ---------------- Utils ---------------- */
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2,7);
function esc(s){ return (s===undefined||s===null) ? '' : String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function fmtDate(d){ if(!d) return '—'; const dt=new Date(d); if(isNaN(dt)) return d; return dt.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit',year:'numeric'}); }
function age(birthDate){
  if(!birthDate) return '—';
  const b = new Date(birthDate); if(isNaN(b)) return '—';
  const t = new Date();
  let a = t.getFullYear()-b.getFullYear();
  if(t.getMonth()<b.getMonth() || (t.getMonth()===b.getMonth() && t.getDate()<b.getDate())) a--;
  return a;
}
function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(()=>t.classList.remove('show'), 2200);
}
function byId(arr, id){ return (arr||[]).find(x=>x.id===id); }
function nameOf(arr, id, field='name'){ const o = byId(arr,id); return o ? o[field] : '—'; }
/* تحويل أي رابط داخل نص لرابط قابل للضغط (يُستخدم في عرض أرقام/حسابات الدفع لدعم لينكات دفع زي إنستاباي) */
function linkifyText(text){
  const escaped = esc(text);
  const withLinks = escaped.replace(/((https?:\/\/|www\.)[^\s<]+)/gi, (match)=>{
    const href = match.toLowerCase().startsWith('http') ? match : 'https://'+match;
    return `<a href="${href}" target="_blank" rel="noopener" style="color:var(--navy); text-decoration:underline; word-break:break-all;">${match}</a>`;
  });
  return withLinks.replace(/\n/g,'<br>');
}
/* تقسيم نص أرقام/حسابات دفع مفصولة بفاصلة أو فاصلة عربية أو فاصلة منقوطة أو نقطة، كل رقم يظهر في سطر منفصل */
function splitAccounts(text){ return String(text||'').split(/[,،؛\n]+/).map(s=>s.trim()).filter(Boolean); }
/* هذه الدوال الثلاثة كانت مُستخدمة في عشرات الأماكن (نماذج المخدوم/الخادم، صفحة المراحل
   والفصول، تسجيل الحضور) لكنها لم تكن مُعرّفة أصلًا — وهو السبب الحقيقي وراء توقف
   أزرار "إضافة مخدوم" و"إضافة خادم" وصفحة "المراحل والفصول" عن الاستجابة تمامًا. */
function gradesOfStage(stageId){ return (DB.grades||[]).filter(g=>g.stageId===stageId).sort((a,b)=>(a.order||0)-(b.order||0)); }
function classesOfGrade(gradeId){ return (DB.classes||[]).filter(c=>c.gradeId===gradeId); }
function stageOfClass(classId){ const c=byId(DB.classes,classId); if(!c) return null; const g=byId(DB.grades,c.gradeId); return g?g.stageId:null; }

/* ---- حقل صورة شخصية قابل لإعادة الاستخدام (مخدوم/خادم/مستخدم) — رفع/حذف مع صورة افتراضية ---- */
function photoFieldHtml(currentPhoto){
  return `
  <div class="field full" style="text-align:center;">
    <label>الصورة الشخصية</label>
    <div id="f-photo-preview" style="width:86px; height:86px; border-radius:50%; overflow:hidden; margin:6px auto; background:var(--gold-soft); color:var(--navy); display:flex; align-items:center; justify-content:center; border:1px solid var(--line); font-size:30px; font-weight:800;">
      ${currentPhoto? `<img src="${currentPhoto}" style="width:100%; height:100%; object-fit:cover;">` : '👤'}
    </div>
    <input type="hidden" id="f-photo-data" value="${currentPhoto||''}">
    <input type="file" id="f-photo-file" accept="image/*" style="display:none;" onchange="handlePhotoSelect()">
    <div style="display:flex; gap:8px; justify-content:center; margin-top:6px;">
      <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('f-photo-file').click()">📷 اختيار صورة</button>
      <button type="button" class="btn btn-ghost btn-sm" onclick="clearPhotoField()">🗑 حذف الصورة</button>
    </div>
  </div>`;
}
async function handlePhotoSelect(){
  const file = document.getElementById('f-photo-file').files[0];
  if(!file) return;
  try{
    const img = await smartImageUpload(file, 400, 0.75);
    document.getElementById('f-photo-data').value = img;
    document.getElementById('f-photo-preview').innerHTML = `<img src="${img}" style="width:100%; height:100%; object-fit:cover;">`;
  }catch(e){ console.error(e); toast('تعذر معالجة الصورة'); }
}
function clearPhotoField(){
  document.getElementById('f-photo-data').value = '';
  document.getElementById('f-photo-file').value = '';
  document.getElementById('f-photo-preview').innerHTML = '👤';
}
/* ---- قراءة باركود/QR بكاميرا الجهاز (تُستخدم في نماذج الكود وتسجيل الحضور) ---- */
const Scanner = {};
Scanner.open = function(onResult){
  UI.openModal('قراءة باركود / QR', `
    <video id="scanner-video" style="width:100%; border-radius:10px; background:#000;" playsinline muted></video>
    <canvas id="scanner-canvas" style="display:none;"></canvas>
    <p class="muted" id="scanner-hint" style="margin-top:10px; text-align:center;">وجّه الكاميرا نحو الكود...</p>
  `, `<button class="btn btn-ghost btn-block" onclick="Scanner.close()">إلغاء</button>`);
  Scanner._onResult = onResult;
  Scanner._start();
};
Scanner._stream = null;
Scanner._raf = null;
Scanner._start = async function(){
  if(!window.jsQR){
    const hint = document.getElementById('scanner-hint');
    if(hint) hint.textContent = 'تعذر تحميل مكتبة قراءة الأكواد — تأكد من اتصال الإنترنت';
    return;
  }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    Scanner._stream = stream;
    const video = document.getElementById('scanner-video');
    if(!video){ stream.getTracks().forEach(t=>t.stop()); return; } // المودال اتقفل قبل ما الكاميرا تجهز
    video.srcObject = stream;
    await video.play();
    Scanner._tick();
  }catch(e){
    const hint = document.getElementById('scanner-hint');
    if(hint) hint.textContent = 'تعذر تشغيل الكاميرا: '+e.message+' — تأكد من السماح بالوصول للكاميرا';
  }
};
Scanner._tick = function(){
  const video = document.getElementById('scanner-video');
  const canvas = document.getElementById('scanner-canvas');
  if(!video || !canvas) return; // المودال اتقفل
  if(video.readyState !== video.HAVE_ENOUGH_DATA){ Scanner._raf = requestAnimationFrame(Scanner._tick); return; }
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const imgData = ctx.getImageData(0,0,canvas.width,canvas.height);
  const code = jsQR(imgData.data, imgData.width, imgData.height);
  if(code && code.data){
    const result = code.data;
    Scanner.close();
    if(Scanner._onResult) Scanner._onResult(result);
  } else {
    Scanner._raf = requestAnimationFrame(Scanner._tick);
  }
};
Scanner.close = function(){
  if(Scanner._raf) cancelAnimationFrame(Scanner._raf);
  Scanner._raf = null;
  if(Scanner._stream) Scanner._stream.getTracks().forEach(t=>t.stop());
  Scanner._stream = null;
  UI.closeModal();
};
/* ---- عرض مرفقات الشات كأيقونة صغيرة بدل صورة كبيرة، مع نافذة معاينة + تحميل/مشاركة ---- */
function chatAttachmentThumb(img){
  return `<div onclick="previewChatImage('${img.replace(/'/g,"\\'")}')" style="width:56px; height:56px; border-radius:9px; overflow:hidden; cursor:pointer; border:1px solid rgba(0,0,0,.12); flex-shrink:0;"><img src="${img}" style="width:100%; height:100%; object-fit:cover;"></div>`;
}
function previewChatImage(url){
  UI.openModal('مرفق', `<div style="text-align:center;"><img src="${url}" style="max-width:100%; border-radius:10px; border:1px solid var(--line);"></div>`,
    `<a class="btn btn-primary btn-block" href="${url}" target="_blank" rel="noopener" download>⬇️ فتح / تحميل</a>
     <button class="btn btn-ghost btn-block" onclick="shareChatImage('${url.replace(/'/g,"\\'")}')">📤 مشاركة الرابط</button>`);
}
async function shareChatImage(url){
  try{
    if(navigator.share){ await navigator.share({url}); return; }
  }catch(e){ return; } // المستخدم لغى نافذة المشاركة، تجاهل
  try{ await navigator.clipboard.writeText(url); toast('تم نسخ رابط الصورة'); }catch(e){ /* تجاهل */ }
}
window.previewChatImage = previewChatImage;
window.shareChatImage = shareChatImage;
window.Scanner = Scanner;
/* هذه الدوال بتتنادى من داخل onclick/onchange/oninput فى الـ HTML مباشرة، وبما إن app.js
   شغّال كـ ES module فكل الدوال بتبقى محجوبة جوه نطاق الملف ومش متاحة عالميًا تلقائيًا —
   لازم نصدّرها لـ window يدويًا، وإلا أي زرار أو حقل بيستخدمها هيفشل بصمت (مفيش أي رد فعل). */
window.mpOnStageChange = mpOnStageChange;
window.mpOnGradeChange = mpOnGradeChange;
window.mpRenderResults = mpRenderResults;
window.mpSelect = mpSelect;
window.mpSelectByCode = mpSelectByCode;
window.handlePhotoSelect = handlePhotoSelect;
window.clearPhotoField = clearPhotoField;
/* ---- أداة اختيار مخدوم واحد: بحث بالاسم/الكود + فلترة مرحلة/صف/فصل + قراءة باركود ---- */
function memberPickerHtml(fieldId, selectedId){
  const sel = selectedId ? byId(DB.members, selectedId) : null;
  return `
  <div class="field full">
    <label>المخدوم</label>
    <div class="toolbar" style="margin-bottom:6px;">
      <select id="${fieldId}-stage" onchange="mpOnStageChange('${fieldId}')" style="min-width:120px;">${selectOptions(DB.stages,'','كل المراحل')}</select>
      <select id="${fieldId}-grade" onchange="mpOnGradeChange('${fieldId}')" style="min-width:120px;"><option value="">كل الصفوف</option></select>
      <select id="${fieldId}-class" onchange="mpRenderResults('${fieldId}')" style="min-width:110px;"><option value="">كل الفصول</option></select>
      <input id="${fieldId}-search" placeholder="بحث بالاسم أو الكود..." oninput="mpRenderResults('${fieldId}')" style="flex:1; min-width:140px;">
      <button type="button" class="btn btn-ghost btn-sm" onclick="Scanner.open(v=>mpSelectByCode('${fieldId}', v))">📷</button>
    </div>
    <input type="hidden" id="${fieldId}" value="${selectedId||''}">
    <div id="${fieldId}-selected" class="muted" style="margin-bottom:6px;">${sel? '✅ المختار: '+esc(sel.name) : 'اكتب اسم/كود أو اختار مرحلة للبحث'}</div>
    <div id="${fieldId}-results" style="max-height:170px; overflow:auto; border:1px solid var(--line); border-radius:8px;"></div>
  </div>`;
}
function mpOnStageChange(fieldId){
  const stageId = document.getElementById(fieldId+'-stage').value;
  const gradeSel = document.getElementById(fieldId+'-grade');
  gradeSel.innerHTML = '<option value="">كل الصفوف</option>' + selectOptions(gradesOfStage(stageId),'');
  document.getElementById(fieldId+'-class').innerHTML = '<option value="">كل الفصول</option>';
  mpRenderResults(fieldId);
}
function mpOnGradeChange(fieldId){
  const gradeId = document.getElementById(fieldId+'-grade').value;
  document.getElementById(fieldId+'-class').innerHTML = '<option value="">كل الفصول</option>' + selectOptions(classesOfGrade(gradeId),'');
  mpRenderResults(fieldId);
}
function mpRenderResults(fieldId){
  const box = document.getElementById(fieldId+'-results');
  const q = document.getElementById(fieldId+'-search').value.trim().toLowerCase();
  const stageId = document.getElementById(fieldId+'-stage').value;
  const gradeId = document.getElementById(fieldId+'-grade').value;
  const classId = document.getElementById(fieldId+'-class').value;
  let list = DB.members;
  if(stageId) list = list.filter(m=>m.stageId===stageId);
  if(gradeId) list = list.filter(m=>m.gradeId===gradeId);
  if(classId) list = list.filter(m=>m.classId===classId);
  if(q) list = list.filter(m=> m.name.toLowerCase().includes(q) || (m.code||'').toLowerCase().includes(q));
  if(!q && !stageId && !gradeId && !classId){ box.innerHTML=''; return; }
  list = list.slice(0,25);
  box.innerHTML = list.length ? list.map(m=>`<div class="status-dd-item" onclick="mpSelect('${fieldId}','${m.id}')">${esc(m.name)} <small class="muted">${esc(m.code||'')}</small></div>`).join('')
    : `<div class="muted" style="padding:8px;">لا نتائج مطابقة</div>`;
}
function mpSelect(fieldId, memberId){
  const m = byId(DB.members, memberId);
  document.getElementById(fieldId).value = memberId;
  document.getElementById(fieldId+'-selected').innerHTML = '✅ المختار: '+esc(m?m.name:'');
  document.getElementById(fieldId+'-results').innerHTML = '';
  document.getElementById(fieldId+'-search').value = '';
}
function mpSelectByCode(fieldId, code){
  const m = DB.members.find(x=>(x.code||'').trim()===code.trim());
  if(!m){ toast('مفيش مخدوم بالكود ده: '+code); return; }
  mpSelect(fieldId, m.id);
}
function codeFieldHtml(id, value, placeholder){
  return `<div class="field"><label>الكود / الباركود</label>
    <div style="display:flex; gap:6px;">
      <input id="${id}" value="${esc(value||'')}" placeholder="${placeholder||''}" style="flex:1;">
      <button type="button" class="btn btn-ghost btn-sm" onclick="Scanner.open(v=>document.getElementById('${id}').value=v)" title="قراءة عن طريق الكاميرا">📷</button>
    </div>
  </div>`;
}

/* ---------------- Firebase ---------------- */
import { firebaseConfig } from './firebase-config.js';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-app.js';
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, deleteUser,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, getDocs, query, where, orderBy, limit, onSnapshot, serverTimestamp,
  enableIndexedDbPersistence, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.13.1/firebase-firestore.js';

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const dbFire = getFirestore(fbApp);
try{ enableIndexedDbPersistence(dbFire); }catch(e){ /* غير مدعوم في بعض المتصفحات - النظام يعمل بدونه بشكل طبيعي */ }

/* حالة تعدد الكنايس (Multi-tenant) */
let CURRENT_CHURCH_ID = null;
let CURRENT_CHURCH = null;
let REGISTERING = false; // true أثناء تنفيذ عملية تسجيل كنيسة جديدة (لتجاهل onAuthStateChanged المؤقت)

const TRIAL_DAYS = 14;

/* المجموعات الخاصة ببيانات كل كنيسة (معلّمة بحقل churchId) */
const LIVE_COLLECTIONS = ['stages','grades','classes','members','servants','attendance','evaluations','followups','activities'];
let unsubscribers = [];

function detachListeners(){ unsubscribers.forEach(u=>u()); unsubscribers = []; }

function attachListeners(onReady){
  const isAdmin = CURRENT_USER && (CURRENT_USER.role==='admin' || IMPERSONATING);
  let pending = LIVE_COLLECTIONS.length + 2 + (isAdmin?1:0); // + settings + auditLog + (users لو مدير كنيسة)
  const tick = () => { pending--; if(pending<=0 && onReady) { onReady(); onReady=null; } renderCurrent(); };

  if(isAdmin){
    const uq = query(collection(dbFire,'users'), where('churchId','==',CURRENT_CHURCH_ID));
    const unsubUsers = onSnapshot(uq, snap=>{
      DB.users = snap.docs.map(d=>({id:d.id, ...d.data()}));
      tick();
    }, err=>console.error(err));
    unsubscribers.push(unsubUsers);
  }

  LIVE_COLLECTIONS.forEach(col=>{
    const q = query(collection(dbFire, col), where('churchId','==',CURRENT_CHURCH_ID));
    const unsub = onSnapshot(q, snap=>{
      DB[col] = snap.docs.map(d=>({id:d.id, ...d.data()}));
      tick();
    }, err=>{ console.error(col, err); toast('تعذر تحميل بيانات: '+col); });
    unsubscribers.push(unsub);
  });

  const unsubSettings = onSnapshot(doc(dbFire,'settings',CURRENT_CHURCH_ID), d=>{
    DB.settings = d.exists() ? d.data() : {churchName: CURRENT_CHURCH?CURRENT_CHURCH.name:'', schoolName:'مدرسة الأحد', contact:CURRENT_CHURCH?CURRENT_CHURCH.contactPhone:''};
    document.getElementById('church-name-label').textContent = DB.settings.churchName || 'إدارة مدارس الأحد';
    tick();
  }, err=>console.error(err));
  unsubscribers.push(unsubSettings);

  const auditQ = query(collection(dbFire,'auditLog'), where('churchId','==',CURRENT_CHURCH_ID), orderBy('date','desc'), limit(200));
  const unsubAudit = onSnapshot(auditQ, snap=>{
    DB.auditLog = snap.docs.map(d=>({id:d.id, ...d.data()}));
    tick();
  }, err=>console.error(err));
  unsubscribers.push(unsubAudit);

  // متابعة حالة اشتراك الكنيسة نفسها لحظيًا (عشان الشاشة تتحدث فور موافقة/تفعيل الإدارة)
  const unsubChurch = onSnapshot(doc(dbFire,'churches',CURRENT_CHURCH_ID), d=>{
    if(d.exists()) CURRENT_CHURCH = d.data();
  }, err=>console.error(err));
  unsubscribers.push(unsubChurch);

  // طرق الدفع المتاحة (بيانات عامة يشوفها الجميع)
  const unsubMethods = onSnapshot(collection(dbFire,'paymentMethods'), snap=>{
    DB.paymentMethods = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(m=>m.active!==false);
    if(CURRENT_PAGE==='billing') renderCurrent();
  }, err=>console.error(err));
  unsubscribers.push(unsubMethods);

  // إثباتات الدفع الخاصة بالكنيسة
  const unsubProofs = onSnapshot(query(collection(dbFire,'paymentProofs'), where('churchId','==',CURRENT_CHURCH_ID)), snap=>{
    DB.paymentProofs = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    if(CURRENT_PAGE==='billing') renderCurrent();
  }, err=>console.error(err));
  unsubscribers.push(unsubProofs);

  // رسائل الدردشة مع الإدارة
  const unsubChat = onSnapshot(query(collection(dbFire,'chatMessages'), where('churchId','==',CURRENT_CHURCH_ID)), snap=>{
    DB.chatMessages = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const unread = DB.chatMessages.filter(m=> m.senderRole==='superadmin' && m.readByChurch===false);
    App.updateNavBadge('chat', unread.length);
    if(CURRENT_PAGE==='chat'){ Chat.renderMessages(); markChatRead(unread, 'readByChurch'); }
  }, err=>console.error(err));
  unsubscribers.push(unsubChat);

  // أنواع التذاكر المتاحة (يديرها المالك، بيانات عامة)
  const unsubTTypes = onSnapshot(doc(dbFire,'ticketTypes','main'), d=>{
    TICKET_TYPES = d.exists() ? (d.data().types||[]) : [];
    if(CURRENT_PAGE==='tickets') Tickets.render();
  }, err=>console.error(err));
  unsubscribers.push(unsubTTypes);

  // تذاكر الدعم الفني/الشكاوى الخاصة بالكنيسة
  const unsubTickets = onSnapshot(query(collection(dbFire,'tickets'), where('churchId','==',CURRENT_CHURCH_ID)), snap=>{
    DB.tickets = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const unread = DB.tickets.filter(t=> t.readByChurch===false);
    App.updateNavBadge('tickets', unread.length);
    if(CURRENT_PAGE==='tickets'){ Tickets.render(); markChatRead(unread, 'readByChurch', 'tickets'); }
  }, err=>console.error(err));
  unsubscribers.push(unsubTickets);

  // خطط الاشتراك المعلنة (معلوماتية)
  const unsubPlans = onSnapshot(collection(dbFire,'subscriptionPlans'), snap=>{
    DB.plans = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(CURRENT_PAGE==='billing') Views.billing();
  }, err=>console.error(err));
  unsubscribers.push(unsubPlans);
}

function renderCurrent(){
  if(document.getElementById('app').style.display==='none') return;
  App.navigate(CURRENT_PAGE, CURRENT_PARAM);
}

/* ---- أدوات قراءة/كتابة عامة على Firestore ---- */
/* fsAdd بيضيف churchId تلقائيًا لأي مجموعة من بيانات الكنيسة (LIVE_COLLECTIONS) */
async function fsAdd(col, data){
  const payload = LIVE_COLLECTIONS.includes(col) ? {...data, churchId: CURRENT_CHURCH_ID} : data;
  const ref = await addDoc(collection(dbFire,col), payload);
  return ref.id;
}
/* fsAddRaw بيضيف من غير أي إضافة تلقائية - يُستخدم وقت التسجيل/الإعداد الأولي قبل ما نكون "داخلين" بحساب مفعّل */
async function fsAddRaw(col, data){ const ref = await addDoc(collection(dbFire,col), data); return ref.id; }
/* تعليم مستندات (رسائل شات أو تذاكر) كمقروءة دفعة واحدة عن طريق تحديث حقل واحد بس */
/* حذف رسالة شات (نص أو مرفق) — متاحة لصاحب الرسالة أو للمالك، حسب قواعد الأمان */
async function deleteChatMessage(id){
  if(!confirm('حذف هذه الرسالة نهائيًا؟')) return;
  try{ await deleteDoc(doc(dbFire,'chatMessages',id)); }
  catch(e){ console.error(e); toast('تعذر حذف الرسالة: '+e.message); }
}
window.deleteChatMessage = deleteChatMessage;
/* إغلاق كاميرا الباركود تلقائيًا فى أي سيناريو تاني ممكن ينسى فيه المستخدم الكاميرا شغالة */
function stopScannerIfActive(){
  if(window.Scanner && Scanner._stream){ Scanner._stream.getTracks().forEach(t=>t.stop()); Scanner._stream=null; }
  if(window.Scanner && Scanner._raf){ cancelAnimationFrame(Scanner._raf); Scanner._raf=null; }
}
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) stopScannerIfActive(); });
window.addEventListener('pagehide', stopScannerIfActive);
window.addEventListener('beforeunload', stopScannerIfActive);
async function markChatRead(items, field, col='chatMessages'){  const unread = (items||[]).filter(m=> m[field]===false);
  if(!unread.length) return;
  try{
    const batch = writeBatch(dbFire);
    unread.forEach(m=> batch.update(doc(dbFire,col,m.id), {[field]:true}));
    await batch.commit();
  }catch(e){ console.error(e); }
}
async function fsSet(col, id, data){ await setDoc(doc(dbFire,col,id), data, {merge:true}); }
async function fsUpdate(col, id, data){ await updateDoc(doc(dbFire,col,id), data); }
async function fsDelete(col, id){ await deleteDoc(doc(dbFire,col,id)); }
async function fsDeleteWhere(col, field, value){
  const snap = await getDocs(query(collection(dbFire,col), where(field,'==',value)));
  await Promise.all(snap.docs.map(d=>deleteDoc(d.ref)));
}
async function log(action, details){
  try{
    // لو المالك داخل مؤقتًا على لوحة كنيسة (Impersonation)، يتسجّل باسم "الإدارة" بس
    // من غير اسمه الشخصي، حفاظًا على خصوصية الطرفين — مع إبقاء وجود الإجراء نفسه واضح للكنيسة.
    const userLabel = IMPERSONATING ? 'الإدارة' : (CURRENT_USER ? CURRENT_USER.name : '—');
    const payload = { date: new Date().toISOString(), user: userLabel, action, details: details||'' };
    if(CURRENT_CHURCH_ID) payload.churchId = CURRENT_CHURCH_ID;
    await addDoc(collection(dbFire,'auditLog'), payload);
  }catch(e){ console.error('audit log failed', e); }
}

/* المراحل والصفوف الافتراضية لأي كنيسة جديدة */
const DEFAULT_STAGE_DEFS = [
  {name:'حضانة', grades:['تمهيدي أول','تمهيدي ثاني']},
  {name:'ابتدائي', grades:['الأول الابتدائي','الثاني الابتدائي','الثالث الابتدائي','الرابع الابتدائي','الخامس الابتدائي','السادس الابتدائي']},
  {name:'إعدادي', grades:['الأول الإعدادي','الثاني الإعدادي','الثالث الإعدادي']},
  {name:'ثانوي', grades:['الأول الثانوي','الثاني الثانوي','الثالث الثانوي']},
  {name:'جامعة', grades:['الفرقة الأولى','الفرقة الثانية','الفرقة الثالثة','الفرقة الرابعة']},
  {name:'شباب', grades:['عام']},
];
async function seedChurchDefaults(churchId, churchName){
  for(const st of DEFAULT_STAGE_DEFS){
    const stageId = await fsAddRaw('stages', {name: st.name, churchId});
    for(let i=0;i<st.grades.length;i++){
      await fsAddRaw('grades', {name: st.grades[i], stageId, order:i, churchId});
    }
  }
  await setDoc(doc(dbFire,'settings',churchId), {churchName: churchName||'', schoolName:'مدرسة الأحد', contact:''});
}
/* نقل أي بيانات قديمة (من قبل تفعيل تعدد الكنايس) لكنيسة تجريبية منفصلة، بدون ما تضيع */
async function tagLegacyDataWithChurch(churchId){
  for(const col of LIVE_COLLECTIONS){
    const snap = await getDocs(collection(dbFire,col));
    await Promise.all(snap.docs.filter(d=>!d.data().churchId).map(d=>updateDoc(d.ref, {churchId})));
  }
  const oldSettings = await getDoc(doc(dbFire,'settings','main'));
  if(oldSettings.exists()){
    await setDoc(doc(dbFire,'settings',churchId), oldSettings.data(), {merge:true});
  }
}

/* ---------------- شاشات المصادقة ---------------- */
function hideAllAuthScreens(){
  ['login-screen','register-screen','pending-screen','locked-screen','forgot-screen','join-screen'].forEach(id=>{
    document.getElementById(id).style.display='none';
  });
  document.getElementById('app').style.display='none';
  document.getElementById('superadmin-app').style.display='none';
}
function showPendingScreen(msg){
  hideAllAuthScreens();
  document.getElementById('pending-message').textContent = msg;
  document.getElementById('pending-screen').style.display='flex';
}
function showLockedScreen(msg){
  hideAllAuthScreens();
  document.getElementById('locked-message').textContent = msg;
  document.getElementById('locked-screen').style.display='flex';
}
function mapAuthError(e){
  const code = e && e.code || '';
  if(code==='auth/email-already-in-use') return 'البريد الإلكتروني ده مسجّل بالفعل';
  if(code==='auth/invalid-email') return 'صيغة البريد الإلكتروني غير صحيحة';
  if(code==='auth/weak-password') return 'كلمة المرور ضعيفة، استخدم 6 أحرف على الأقل';
  if(code==='auth/wrong-password' || code==='auth/invalid-credential') return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  if(code==='auth/user-not-found') return 'لا يوجد حساب مسجّل بهذا البريد الإلكتروني';
  if(code==='auth/too-many-requests') return 'محاولات كثيرة متتالية، حاول تاني بعد شوية';
  return 'حدث خطأ: ' + (e && e.message ? e.message : '');
}

/* ---------------- Auth ---------------- */
const App = {};
App.showRegister = function(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('register-screen').style.display='flex';
};
App.showJoin = function(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('join-screen').style.display='flex';
};
App.submitJoin = async function(){
  const email = document.getElementById('join-email').value.trim().toLowerCase();
  const pass = document.getElementById('join-pass').value;
  const err = document.getElementById('join-error');
  const btn = document.getElementById('join-btn');
  err.style.display='none'; err.style.color='';
  if(!email || !pass){ err.textContent='أدخل البريد الإلكتروني وكلمة المرور'; err.style.display='block'; return; }
  if(pass.length < 6){ err.textContent='كلمة المرور 6 أحرف على الأقل'; err.style.display='block'; return; }
  btn.disabled = true; btn.textContent='جاري التفعيل...';
  REGISTERING = true;
  let cred = null;
  try{
    cred = await createUserWithEmailAndPassword(auth, email, pass);
    const inviteSnap = await getDoc(doc(dbFire,'invites', email));
    if(!inviteSnap.exists() || inviteSnap.data().used){
      await deleteUser(cred.user);
      err.textContent = 'مفيش دعوة صالحة على البريد ده. تأكد من البريد أو اطلب من مسؤول كنيستك يبعتلك دعوة جديدة.';
      err.style.display='block';
      return;
    }
    const inv = inviteSnap.data();
    await setDoc(doc(dbFire,'users', cred.user.uid), {
      name: inv.name || email.split('@')[0], email, role: inv.role, churchId: inv.churchId,
      ...(inv.permissions? {permissions: inv.permissions} : {}),
      ...(inv.jobTitle? {jobTitle: inv.jobTitle} : {}),
      ...(inv.phone? {phone: inv.phone} : {}),
    });
    await updateDoc(doc(dbFire,'invites', email), {used:true});
    await signOut(auth);
    document.getElementById('join-screen').style.display='none';
    document.getElementById('pending-message').textContent = 'تم تفعيل حسابك بنجاح! سجّل الدخول دلوقتي بنفس البريد وكلمة المرور اللي اخترتها.';
    document.getElementById('pending-screen').style.display='flex';
  }catch(e){
    if(cred){ try{ await deleteUser(cred.user); }catch(_){} }
    err.textContent = mapAuthError(e);
    err.style.display='block';
  }finally{
    btn.disabled = false; btn.textContent='تفعيل حسابي';
    REGISTERING = false;
  }
};


App.showLogin = function(){
  document.getElementById('register-screen').style.display='none';
  document.getElementById('forgot-screen').style.display='none';
  document.getElementById('join-screen').style.display='none';
  document.getElementById('pending-screen').style.display='none';
  document.getElementById('login-screen').style.display='flex';
};
App.showForgot = function(){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('forgot-screen').style.display='flex';
};
App.submitForgot = async function(){
  const email = document.getElementById('forgot-email').value.trim();
  const err = document.getElementById('forgot-error');
  const btn = document.getElementById('forgot-btn');
  err.style.display='none';
  if(!email){ err.textContent='أدخل بريدك الإلكتروني'; err.style.display='block'; return; }
  btn.disabled = true; btn.textContent='جاري الإرسال...';
  try{
    await sendPasswordResetEmail(auth, email);
    err.style.color = 'var(--present)';
    err.textContent = 'تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك، افتحه واتبع التعليمات.';
    err.style.display='block';
  }catch(e){
    err.style.color = '';
    err.textContent = mapAuthError(e);
    err.style.display='block';
  }finally{
    btn.disabled = false; btn.textContent='إرسال رابط الاستعادة';
  }
};

App.login = async function(){
  const email = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  err.style.display='none';
  if(!email || !pass){ err.textContent='من فضلك أدخل البريد الإلكتروني وكلمة المرور'; err.style.display='block'; return; }
  btn.disabled = true; btn.textContent='جاري الدخول...';
  try{
    await signInWithEmailAndPassword(auth, email, pass);
    // onAuthStateChanged هيتولى الباقي (تحميل الدور والدخول للتطبيق)
  }catch(e){
    err.textContent = mapAuthError(e);
    err.style.display='block';
  }finally{
    btn.disabled = false; btn.textContent='دخول';
  }
};

App.submitRegister = async function(){
  const churchName = document.getElementById('reg-church-name').value.trim();
  const churchPhone = document.getElementById('reg-church-phone').value.trim();
  const adminName = document.getElementById('reg-admin-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass = document.getElementById('reg-pass').value;
  const err = document.getElementById('register-error');
  const btn = document.getElementById('register-btn');
  err.style.display='none';
  if(!churchName || !adminName || !email || !pass){ err.textContent='من فضلك املأ كل الحقول'; err.style.display='block'; return; }
  if(pass.length < 6){ err.textContent='كلمة المرور 6 أحرف على الأقل'; err.style.display='block'; return; }
  btn.disabled = true; btn.textContent='جاري الإرسال...';
  REGISTERING = true;
  try{
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    const newChurchId = await fsAddRaw('churches', {
      name: churchName, contactPhone: churchPhone, contactEmail: email, status: 'pending', createdAt: Date.now(),
    });
    await setDoc(doc(dbFire,'users', cred.user.uid), {
      name: adminName, email, role: 'admin', churchId: newChurchId,
    });
    await seedChurchDefaults(newChurchId, churchName);
    await signOut(auth);
    document.getElementById('register-screen').style.display='none';
    document.getElementById('pending-message').textContent = 'تم استلام طلب تسجيل كنيسة "'+churchName+'"، وهيتم تفعيل حسابك بمجرد الموافقة والتواصل معاك.';
    document.getElementById('pending-screen').style.display='flex';
  }catch(e){
    err.textContent = mapAuthError(e);
    err.style.display='block';
  }finally{
    btn.disabled = false; btn.textContent='إرسال طلب التسجيل';
    REGISTERING = false;
  }
};

App.logout = async function(){
  await log('تسجيل خروج', CURRENT_USER?CURRENT_USER.name:'');
  await signOut(auth);
};
const ROLE_LABELS = {admin:'مدير النظام', servant:'خادم', staff:'مستخدم إداري', superadmin:'مالك النظام', subadmin:'أدمن فرعي'};

onAuthStateChanged(auth, async (fbUser) => {
  console.log('[AUTH] onAuthStateChanged fired. fbUser =', fbUser ? fbUser.email : null, 'REGISTERING =', REGISTERING);
  if(REGISTERING) { console.log('[AUTH] skipped: REGISTERING flag is true'); return; }
  detachListeners();
  if(!fbUser){
    console.log('[AUTH] no fbUser -> showing login screen');
    CURRENT_USER = null; CURRENT_CHURCH_ID = null; CURRENT_CHURCH = null;
    hideAllAuthScreens();
    document.getElementById('login-screen').style.display='flex';
    return;
  }
  try{
    console.log('[AUTH] step 1: fetching users/'+fbUser.uid);
    let roleDoc = await getDoc(doc(dbFire,'users', fbUser.uid));
    console.log('[AUTH] step 1 done. roleDoc.exists =', roleDoc.exists());

    if(!roleDoc.exists()){
      console.log('[AUTH] step 2: no role doc yet, checking if system is empty (bootstrap check)');
      const churchesSnap = await getDocs(collection(dbFire,'churches'));
      const usersSnap = await getDocs(collection(dbFire,'users'));
      console.log('[AUTH] step 2 done. churchesEmpty =', churchesSnap.empty, 'usersEmpty =', usersSnap.empty);
      if(churchesSnap.empty && usersSnap.empty){
        console.log('[AUTH] step 2b: system empty -> promoting this account to superadmin');
        await setDoc(doc(dbFire,'users', fbUser.uid), {name: fbUser.email.split('@')[0], email: fbUser.email, role: 'superadmin'});
        roleDoc = await getDoc(doc(dbFire,'users', fbUser.uid));
        console.log('[AUTH] step 2b done. roleDoc.exists =', roleDoc.exists());
      } else {
        console.log('[AUTH] step 2c: system not empty, no role for this account -> pending screen');
        showPendingScreen('تم تسجيل دخولك، لكن لا يوجد لك دور مُفعّل في النظام. تواصل مع الإدارة.');
        await signOut(auth);
        return;
      }
    }

    let userData = roleDoc.data();
    console.log('[AUTH] step 3: userData =', JSON.stringify(userData));

    // ترقية تلقائية لمرة واحدة: حساب "مدير" قديم من قبل تفعيل تعدد الكنايس ومعندوش كنيسة مرتبطة
    if(userData.role === 'admin' && !userData.churchId){
      console.log('[AUTH] step 4: legacy admin without churchId -> checking migration');
      const churchesSnap = await getDocs(collection(dbFire,'churches'));
      if(churchesSnap.empty){
        console.log('[AUTH] step 4b: migrating legacy admin to superadmin + demo church');
        const demoChurchId = await fsAddRaw('churches', {
          name: (userData.name||'بيانات')+' - كنيسة تجريبية', contactPhone:'', contactEmail:userData.email,
          status:'active', activeUntil: '2099-12-31', createdAt: Date.now(),
        });
        await tagLegacyDataWithChurch(demoChurchId);
        await setDoc(doc(dbFire,'users', fbUser.uid), {name:userData.name, email:userData.email, role:'superadmin'});
        roleDoc = await getDoc(doc(dbFire,'users', fbUser.uid));
        userData = roleDoc.data();
        console.log('[AUTH] step 4b done. new userData =', JSON.stringify(userData));
      }
    }

    CURRENT_USER = {uid: fbUser.uid, email: fbUser.email, ...userData};
    console.log('[AUTH] step 5: CURRENT_USER set. role =', CURRENT_USER.role);

    /* ----- مالك النظام: لوحة منفصلة تمامًا ----- */
    if(CURRENT_USER.role === 'superadmin'){
      console.log('[AUTH] step 6: role is superadmin -> showing superadmin-app');
      hideAllAuthScreens();
      const saApp = document.getElementById('superadmin-app');
      console.log('[AUTH] superadmin-app element found?', !!saApp);
      saApp.style.display='flex';
      document.getElementById('sa-user-name').textContent = CURRENT_USER.name;
      console.log('[AUTH] step 7: calling SuperAdmin.boot()');
      SuperAdmin.boot();
      console.log('[AUTH] step 8: SuperAdmin.boot() called, logging audit entry');
      await log('تسجيل دخول (مالك النظام)', CURRENT_USER.name);
      console.log('[AUTH] DONE - superadmin flow complete');
      return;
    }

    /* ----- أدمن فرعي: نفس لوحة المالك، لكن بصلاحيات محدودة ----- */
    if(CURRENT_USER.role === 'subadmin'){
      hideAllAuthScreens();
      const saApp = document.getElementById('superadmin-app');
      saApp.style.display='flex';
      document.getElementById('sa-user-name').textContent = CURRENT_USER.name + ' (أدمن فرعي)';
      SuperAdmin.boot();
      SuperAdmin.applyPermissionGating();
      await saLog('تسجيل دخول (أدمن فرعي)', CURRENT_USER.name);
      return;
    }

    /* ----- باقي الأدوار: لازم تكون مرتبطة بكنيسة نشطة ----- */
    console.log('[AUTH] step 6b: not superadmin, churchId =', CURRENT_USER.churchId);
    if(!CURRENT_USER.churchId){
      showPendingScreen('لا يوجد لك كنيسة مرتبطة بعد. تواصل مع الإدارة.');
      await signOut(auth); return;
    }
    const churchSnap = await getDoc(doc(dbFire,'churches', CURRENT_USER.churchId));
    if(!churchSnap.exists()){
      showPendingScreen('كنيستك غير موجودة في النظام. تواصل مع الإدارة.');
      await signOut(auth); return;
    }
    const church = churchSnap.data();
    CURRENT_CHURCH_ID = CURRENT_USER.churchId;
    CURRENT_CHURCH = church;

    if(church.status === 'pending'){
      showPendingScreen('طلب تسجيل كنيسة "'+church.name+'" لسه قيد المراجعة من الإدارة، وهيتم التواصل معاكم بمجرد الموافقة.');
      await signOut(auth); return;
    }
    if(church.status === 'rejected'){
      showPendingScreen('للأسف تم رفض طلب تسجيل كنيسة "'+church.name+'". تواصل مع الإدارة لمزيد من التفاصيل.');
      await signOut(auth); return;
    }
    const now = Date.now();
    const trialEnd = church.trialEndsAt ? new Date(church.trialEndsAt).getTime() : 0;
    const activeEnd = church.activeUntil ? new Date(church.activeUntil).getTime() : 0;
    const isExempt = church.status === 'exempt';
    const trialValid = church.status==='trial' && trialEnd > now;
    const activeValid = church.status==='active' && activeEnd > now;
    if(!isExempt && !trialValid && !activeValid){
      showLockedScreen('انتهت مدة اشتراك كنيسة "'+church.name+'" في النظام. للتجديد، تواصل مع الإدارة.');
      await signOut(auth); return;
    }

    /* ----- تمام: دخول عادي للنظام ----- */
    console.log('[AUTH] step 9: normal church login, showing app');
    hideAllAuthScreens();
    document.getElementById('app').style.display='flex';
    document.getElementById('current-user-name').textContent = CURRENT_USER.name;
    document.getElementById('current-user-role').textContent = ROLE_LABELS[CURRENT_USER.role]||CURRENT_USER.role;
    buildNav();
    DB.users = [CURRENT_USER];
    attachListeners(()=>{ App.navigate('dashboard'); });
    await log('تسجيل دخول', CURRENT_USER.name);
    console.log('[AUTH] DONE - church login flow complete');
  }catch(e){
    console.error('[AUTH] CAUGHT ERROR:', e);
    hideAllAuthScreens();
    document.getElementById('login-error').textContent = mapAuthError(e);
    document.getElementById('login-error').style.display='block';
    document.getElementById('login-screen').style.display='flex';
  }
});

/* =========================================================
   لوحة المالك (Super Admin) — إدارة كل الكنايس والاشتراكات
   ========================================================= */
const SuperAdmin = {};
let SA_CHURCHES = [];
let SA_METHODS = [];
let SA_PROOFS = [];
let SA_CHAT_CHURCH_ID = null;
let SA_CHAT_MESSAGES = [];
let SA_UNREAD_BY_CHURCH = {}; // churchId -> عدد رسائل الكنيسة اللي لسه المالك مقراهاش
let SA_TICKETS = [];
let SA_TICKET_FILTERS = {type:'', status:'', search:'', from:'', to:''};
let SA_PUBLIC_CONFIG = {};
let SA_ADMIN_LINKS = [];
let SA_ACTIVITY_LOG = [];
let SA_ACTIVITY_FILTERS = {from:'', to:''};
let SA_REPORT_FILTERS = {from:'', to:'', category:''};
let SA_PLANS = [];
let SA_DISCOUNT_CODES = [];
let SA_DECISION_TEMPLATES = {};
let SA_CHURCH_STATUS_FILTER = '';
const CHURCH_STATUS_ICONS = {pending:'🆕', trial:'🔄', active:'✅', expired:'⏰', rejected:'🚫', exempt:'🎁'};
let SA_SUBADMINS = [];
let SA_SUBADMIN_INVITES = [];
let SA_PAGE = 'churches';
let saUnsub = null, saMethodsUnsub = null, saProofsUnsub = null, saChatUnsub = null, saChatsUnreadUnsub = null, saTicketsUnsub = null, saTicketTypesUnsub = null;

/* إخفاء عناصر القائمة اللي الأدمن الفرعي مالوش صلاحية عليها (مالك النظام بيشوف كل حاجة دايمًا) */
SuperAdmin.applyPermissionGating = function(){
  if(CURRENT_USER.role !== 'subadmin') return;
  const perms = CURRENT_USER.permissions || {};
  document.querySelectorAll('#sa-nav li').forEach(li=>{
    if(li.hasAttribute('data-owner-only')){ li.style.display='none'; return; }
    const perm = li.getAttribute('data-perm');
    if(perm && !perms[perm]) li.style.display='none';
  });
};
SuperAdmin.boot = function(){
  if(saUnsub) saUnsub();
  saUnsub = onSnapshot(collection(dbFire,'churches'), snap=>{
    SA_CHURCHES = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const pendingCount = SA_CHURCHES.filter(c=>c.status==='pending').length;
    const badge = document.getElementById('sa-requests-badge');
    badge.textContent = pendingCount;
    badge.style.display = pendingCount ? 'inline-block' : 'none';
    SuperAdmin.render();
  }, err=>console.error(err));

  if(saMethodsUnsub) saMethodsUnsub();
  saMethodsUnsub = onSnapshot(collection(dbFire,'paymentMethods'), snap=>{
    SA_METHODS = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(SA_PAGE==='methods') SuperAdmin.render();
  }, err=>console.error(err));

  if(saProofsUnsub) saProofsUnsub();
  saProofsUnsub = onSnapshot(collection(dbFire,'paymentProofs'), snap=>{
    SA_PROOFS = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const pendingPay = SA_PROOFS.filter(p=>p.status==='pending').length;
    const payBadge = document.getElementById('sa-payments-badge');
    if(payBadge){ payBadge.textContent = pendingPay; payBadge.style.display = pendingPay ? 'inline-block' : 'none'; }
    if(SA_PAGE==='payments') SuperAdmin.render();
  }, err=>console.error(err));

  // كل الرسائل اللي لسه المالك مقراهاش، عبر كل الكنايس (لعرض شارة عدد + ترتيب الأولوية)
  if(saChatsUnreadUnsub) saChatsUnreadUnsub();
  saChatsUnreadUnsub = onSnapshot(query(collection(dbFire,'chatMessages'), where('readBySA','==',false)), snap=>{
    const msgs = snap.docs.map(d=>({id:d.id, ...d.data()}));
    SA_UNREAD_BY_CHURCH = {};
    msgs.forEach(m=>{ SA_UNREAD_BY_CHURCH[m.churchId] = (SA_UNREAD_BY_CHURCH[m.churchId]||0) + 1; });
    const badge = document.getElementById('sa-chats-badge');
    if(badge){ badge.textContent = msgs.length; badge.style.display = msgs.length ? 'inline-block' : 'none'; }
    if(SA_PAGE==='chats' && !SA_CHAT_CHURCH_ID) SuperAdmin.render();
  }, err=>console.error(err));

  // أنواع التذاكر المتاحة (يديرها المالك)
  if(saTicketTypesUnsub) saTicketTypesUnsub();
  saTicketTypesUnsub = onSnapshot(doc(dbFire,'ticketTypes','main'), d=>{
    TICKET_TYPES = d.exists() ? (d.data().types||[]) : [];
    if(SA_PAGE==='tickets') SuperAdmin.render();
  }, err=>console.error(err));

  // كل التذاكر عبر كل الكنايس
  if(saTicketsUnsub) saTicketsUnsub();
  saTicketsUnsub = onSnapshot(collection(dbFire,'tickets'), snap=>{
    SA_TICKETS = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const unreadCount = SA_TICKETS.filter(t=>t.readBySA===false).length;
    const badge = document.getElementById('sa-tickets-badge');
    if(badge){ badge.textContent = unreadCount; badge.style.display = unreadCount ? 'inline-block' : 'none'; }
    if(SA_PAGE==='tickets') SuperAdmin.render();
  }, err=>console.error(err));

  // إعدادات المنصة العامة (رابط تواصل معنا يظهر لأي زائر)
  onSnapshot(doc(dbFire,'platformConfig','public'), d=>{
    SA_PUBLIC_CONFIG = d.exists() ? d.data() : {};
    if(SA_PUBLIC_CONFIG.theme) applyTheme(SA_PUBLIC_CONFIG.theme);
    if(SA_PAGE==='links') SuperAdmin.render();
  }, err=>console.error(err));

  // روابط إدارية سريعة خاصة بالمالك
  onSnapshot(collection(dbFire,'adminLinks'), snap=>{
    SA_ADMIN_LINKS = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(SA_PAGE==='links') SuperAdmin.render();
  }, err=>console.error(err));

  // سجل نشاط المالك (آخر 300 حركة)
  onSnapshot(query(collection(dbFire,'superadminLog'), orderBy('date','desc'), limit(300)), snap=>{
    SA_ACTIVITY_LOG = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(SA_PAGE==='activity') SuperAdmin.render();
  }, err=>console.error(err));

  // خطط الاشتراك المعلنة
  onSnapshot(collection(dbFire,'subscriptionPlans'), snap=>{
    SA_PLANS = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(SA_PAGE==='plans') SuperAdmin.render();
  }, err=>console.error(err));

  // أكواد الخصم/الأيام الإضافية
  onSnapshot(collection(dbFire,'discountCodes'), snap=>{
    SA_DISCOUNT_CODES = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(SA_PAGE==='plans') SuperAdmin.render();
  }, err=>console.error(err));

  // قوالب رسائل مركز اتخاذ القرارات
  onSnapshot(doc(dbFire,'platformConfig','decisionTemplates'), d=>{
    SA_DECISION_TEMPLATES = d.exists() ? d.data() : {};
    if(SA_PAGE==='decisions') SuperAdmin.render();
  }, err=>console.error(err));

  // إدارة الأدمن الفرعي — للمالك الحقيقي بس (مش للأدمن الفرعي نفسه، عشان ميديش صلاحيات لنفسه)
  if(CURRENT_USER.role==='superadmin'){
    onSnapshot(query(collection(dbFire,'users'), where('role','==','subadmin')), snap=>{
      SA_SUBADMINS = snap.docs.map(d=>({id:d.id, ...d.data()}));
      if(SA_PAGE==='subadmins') SuperAdmin.render();
    }, err=>console.error(err));
    onSnapshot(query(collection(dbFire,'invites'), where('role','==','subadmin')), snap=>{
      SA_SUBADMIN_INVITES = snap.docs.map(d=>({id:d.id, ...d.data()}));
      if(SA_PAGE==='subadmins') SuperAdmin.render();
    }, err=>console.error(err));
  }
};
const SA_PAGE_TITLES = {churches:'الكنايس', requests:'طلبات جديدة', methods:'طرق الدفع', plans:'الخطط والعروض', payments:'مراجعة المدفوعات', chats:'الدردشات', tickets:'التذاكر', links:'المظهر والروابط', activity:'سجل النشاط', report:'تقرير شامل', subadmins:'الأدمن الفرعي', decisions:'مركز اتخاذ القرارات'};
SuperAdmin.navigate = function(page){
  stopScannerIfActive();
  SA_PAGE = page;
  UI.closeSaSidebar();
  document.querySelectorAll('#sa-nav a').forEach(a=>a.classList.toggle('active', a.dataset.page===page));
  document.getElementById('sa-page-title').textContent = SA_PAGE_TITLES[page] || page;
  SuperAdmin.render();
};

function daysLeft(dateStr){
  if(!dateStr) return 0;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}
function churchStatusInfo(c){
  if(c.status==='pending') return {label:'قيد المراجعة', cls:'status-pending'};
  if(c.status==='rejected') return {label:'مرفوض', cls:'status-expired'};
  if(c.status==='exempt') return {label:'معفى — مفتوح دائم بدون اشتراك', cls:'status-exempt'};
  if(c.status==='trial'){
    const d = daysLeft(c.trialEndsAt);
    return d>0 ? {label:'تجربة مجانية — باقي '+d+' يوم', cls:'status-trial'} : {label:'انتهت فترة التجربة', cls:'status-expired'};
  }
  if(c.status==='active'){
    const d = daysLeft(c.activeUntil);
    return d>0 ? {label:'نشط — باقي '+d+' يوم', cls:'status-active'} : {label:'انتهى الاشتراك', cls:'status-expired'};
  }
  return {label:c.status||'—', cls:'status-expired'};
}

SuperAdmin.render = function(){
  const el = document.getElementById('sa-content');
  if(SA_PAGE==='methods'){ el.className=''; SuperAdmin.renderMethods(el); return; }
  if(SA_PAGE==='plans'){ el.className=''; SuperAdmin.renderPlans(el); return; }
  if(SA_PAGE==='payments'){ el.className=''; SuperAdmin.renderPayments(el); return; }
  if(SA_PAGE==='report'){ el.className=''; SuperAdmin.renderReport(el); return; }
  if(SA_PAGE==='decisions'){ el.className=''; SuperAdmin.renderDecisions(el); return; }
  if(SA_PAGE==='chats'){ el.className=''; SuperAdmin.renderChats(el); return; }
  if(SA_PAGE==='tickets'){ el.className=''; SuperAdmin.renderTickets(el); return; }
  if(SA_PAGE==='links'){ el.className=''; SuperAdmin.renderLinks(el); return; }
  if(SA_PAGE==='activity'){ el.className=''; SuperAdmin.renderActivity(el); return; }
  if(SA_PAGE==='subadmins'){ el.className=''; SuperAdmin.renderSubAdmins(el); return; }
  el.className = 'church-grid';
  if(SA_PAGE==='requests'){
    const pending = SA_CHURCHES.filter(c=>c.status==='pending');
    el.innerHTML = pending.length ? pending.map(c=>SuperAdmin.churchCard(c)).join('')
      : `<p class="muted">لا توجد طلبات جديدة حاليًا.</p>`;
    return;
  }
  const filtered = SA_CHURCH_STATUS_FILTER ? SA_CHURCHES.filter(c=>c.status===SA_CHURCH_STATUS_FILTER) : SA_CHURCHES;
  const filterBarHtml = `
    <div class="status-dd no-print" style="grid-column:1/-1; margin-bottom:6px;">
      <button type="button" class="status-dd-btn" onclick="SuperAdmin.toggleStatusDD(event)">
        ${SA_CHURCH_STATUS_FILTER? `${CHURCH_STATUS_ICONS[SA_CHURCH_STATUS_FILTER]} ${CHURCH_STATUS_LABELS[SA_CHURCH_STATUS_FILTER]}` : '📋 الحالة: الكل'} ▾
      </button>
      <div class="status-dd-panel" id="sa-status-dd-panel">
        <div class="status-dd-item ${!SA_CHURCH_STATUS_FILTER?'active':''}" onclick="SuperAdmin.setChurchStatusFilter('')">📋 الكل</div>
        ${Object.entries(CHURCH_STATUS_LABELS).map(([k,v])=>`<div class="status-dd-item ${SA_CHURCH_STATUS_FILTER===k?'active':''}" onclick="SuperAdmin.setChurchStatusFilter('${k}')">${CHURCH_STATUS_ICONS[k]} ${v}</div>`).join('')}
      </div>
    </div>
  `;
  el.innerHTML = filterBarHtml + (filtered.length ? filtered.map(c=>SuperAdmin.churchCard(c)).join('')
    : `<p class="muted">لا توجد كنايس مطابقة لهذا الفلتر.</p>`);
};
SuperAdmin.toggleStatusDD = function(e){
  e.stopPropagation();
  document.getElementById('sa-status-dd-panel').classList.toggle('open');
};
SuperAdmin.setChurchStatusFilter = function(val){
  SA_CHURCH_STATUS_FILTER = val;
  SuperAdmin.render();
};
document.addEventListener('click', ()=>{ document.querySelectorAll('.status-dd-panel.open').forEach(p=>p.classList.remove('open')); });

SuperAdmin.churchCard = function(c){
  const info = churchStatusInfo(c);
  return `<div class="church-card" onclick="SuperAdmin.openChurch('${c.id}')">
    <h3>${esc(c.name)}</h3>
    <div class="muted">${esc(c.contactPhone||'—')}</div>
    <div class="muted">${esc(c.contactEmail||'—')}</div>
    <span class="church-status ${info.cls}">${info.label}</span>
  </div>`;
};

SuperAdmin.openChurch = async function(id){
  const c = byId(SA_CHURCHES, id);
  if(!c) return;
  const info = churchStatusInfo(c);
  const isPending = c.status==='pending';
  let usersHtml = `<p class="muted">جاري تحميل المستخدمين...</p>`;
  UI.openModal('كنيسة: '+c.name, `
    <div class="kv" style="margin-bottom:14px;">
      <b>رقم التواصل</b><span>${esc(c.contactPhone||'—')}</span>
      <b>البريد</b><span>${esc(c.contactEmail||'—')}</span>
      <b>الحالة</b><span class="church-status ${info.cls}">${info.label}</span>
      <b>تاريخ التسجيل</b><span>${c.createdAt? fmtDate(new Date(c.createdAt).toISOString()) : '—'}</span>
    </div>
    ${isPending ? `
      <div style="display:flex; gap:10px; margin-bottom:18px;">
        <button class="btn btn-primary" style="flex:1;" onclick="SuperAdmin.approve('${c.id}')">✅ قبول الطلب (تجربة ${TRIAL_DAYS} يوم)</button>
        <button class="btn btn-danger" style="flex:1;" onclick="SuperAdmin.reject('${c.id}')">رفض الطلب</button>
      </div>
    ` : `
      <div style="display:flex; gap:10px; margin-bottom:14px;">
        <button class="btn btn-primary btn-block" onclick="SuperAdmin.enterChurch('${c.id}')">🔑 ادخل كلوحة هذه الكنيسة</button>
      </div>
      <div class="form-grid" style="margin-bottom:10px;">
        <div class="field"><label>تفعيل / تمديد الاشتراك (بالأيام)</label><input type="number" id="sa-extend-days" value="30" min="1"></div>
      </div>
      <button class="btn btn-gold btn-block" onclick="SuperAdmin.extend('${c.id}')" style="margin-bottom:10px;">تفعيل / تمديد</button>
      ${c.status==='exempt'
        ? `<button class="btn btn-ghost btn-block" onclick="SuperAdmin.unexempt('${c.id}')" style="margin-bottom:10px;">إلغاء الإعفاء (رجوع لنظام الاشتراك)</button>`
        : `<button class="btn btn-ghost btn-block" onclick="SuperAdmin.exempt('${c.id}')" style="margin-bottom:10px;">🎁 إعفاء دائم (بدون اشتراك)</button>`
      }
      ${(c.status==='trial'||c.status==='active')
        ? `<button class="btn btn-ghost btn-block" style="margin-bottom:18px; color:var(--absent); border-color:#E7C6BE;" onclick="SuperAdmin.deactivate('${c.id}')">⛔ إلغاء تفعيل الاشتراك الآن</button>`
        : ''
      }
    `}
    <h3 style="font-size:14px;">مستخدمو الكنيسة</h3>
    <div id="sa-church-users">${usersHtml}</div>
    ${!isPending ? `<button class="btn btn-danger btn-block" style="margin-top:18px;" onclick="SuperAdmin.deleteChurch('${c.id}','${esc(c.name).replace(/'/g,"\\'")}')">🗑 حذف الكنيسة نهائيًا (كل بياناتها)</button>` : ''}
  `, `<button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>`);

  try{
    const snap = await getDocs(query(collection(dbFire,'users'), where('churchId','==', id)));
    const users = snap.docs.map(d=>({id:d.id, ...d.data()}));
    const box = document.getElementById('sa-church-users');
    if(box) box.innerHTML = users.length ? `<table><tbody>${users.map(u=>`
      <tr><td>${esc(u.name)}</td><td class="muted">${esc(u.email)}</td><td>${ROLE_LABELS[u.role]||u.role}</td></tr>
    `).join('')}</tbody></table>` : `<p class="muted">لا يوجد مستخدمون مسجلون بعد.</p>`;
  }catch(e){ console.error(e); }
};

/* تسجيل نشاط المالك (يظهر في صفحة سجل النشاط بلوحة المالك) */
async function saLog(action, details){
  try{ await addDoc(collection(dbFire,'superadminLog'), {action, details: details||'', date: Date.now(), user: CURRENT_USER?CURRENT_USER.name:''}); }
  catch(e){ console.error(e); }
}
SuperAdmin.approve = async function(id){
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS*86400000).toISOString();
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'trial', trialEndsAt});
    await saLog('قبول طلب كنيسة', byId(SA_CHURCHES,id)?.name||id);
    UI.closeModal(); toast('تم قبول الكنيسة وبدء فترة تجربة '+TRIAL_DAYS+' يوم');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.reject = async function(id){
  if(!confirm('تأكيد رفض طلب هذه الكنيسة؟')) return;
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'rejected'});
    await saLog('رفض طلب كنيسة', byId(SA_CHURCHES,id)?.name||id);
    UI.closeModal(); toast('تم رفض الطلب');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.extend = async function(id){
  const days = Number(document.getElementById('sa-extend-days').value) || 30;
  const c = byId(SA_CHURCHES, id);
  const base = (c.status==='active' && c.activeUntil && new Date(c.activeUntil).getTime()>Date.now()) ? new Date(c.activeUntil).getTime() : Date.now();
  const activeUntil = new Date(base + days*86400000).toISOString();
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'active', activeUntil});
    await saLog('تمديد/تفعيل اشتراك', `${c?.name||id} — ${days} يوم`);
    UI.closeModal(); toast('تم تفعيل/تمديد الاشتراك '+days+' يوم');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.exempt = async function(id){
  if(!confirm('هتخلي الكنيسة دي مفتوحة دائمًا بدون اشتراك أو حد زمني. متابعة؟')) return;
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'exempt'});
    await saLog('إعفاء دائم', byId(SA_CHURCHES,id)?.name||id);
    UI.closeModal(); toast('تم إعفاء الكنيسة — بقت مفتوحة دائمًا');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.deactivate = async function(id){
  if(!confirm('هل تريد إلغاء تفعيل اشتراك هذه الكنيسة فورًا؟ لن تقدر تدخل النظام إلا بعد ما تفعّل الاشتراك تاني.')) return;
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'active', activeUntil: new Date(Date.now()-1000).toISOString()});
    await saLog('إلغاء تفعيل فوري', byId(SA_CHURCHES,id)?.name||id);
    UI.closeModal(); toast('تم إلغاء تفعيل اشتراك الكنيسة');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.unexempt = async function(id){
  if(!confirm('هترجع الكنيسة دي لنظام الاشتراك العادي (هتتقفل لو مفيش اشتراك ساري). متابعة؟')) return;
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'expired', activeUntil:null});
    await saLog('إلغاء إعفاء', byId(SA_CHURCHES,id)?.name||id);
    UI.closeModal(); toast('تم إلغاء الإعفاء — الكنيسة محتاجة تفعيل اشتراك دلوقتي');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.deleteChurch = async function(id, name){
  const typed = prompt('حذف الكنيسة "'+name+'" وكل بياناتها (مخدومين، خدام، حضور، مستخدمين... كل حاجة) نهائيًا ومفيش رجوع.\n\nاكتب اسم الكنيسة بالظبط للتأكيد:');
  if(typed !== name){ if(typed!==null) toast('الاسم مش مطابق، اتلغت العملية'); return; }
  try{
    toast('جاري حذف بيانات الكنيسة...');
    const tenantCols = ['members','servants','stages','grades','classes','attendance','evaluations','followups','activities','auditLog','paymentProofs','chatMessages'];
    for(const col of tenantCols){
      await fsDeleteWhere(col, 'churchId', id);
    }
    const usersSnap = await getDocs(query(collection(dbFire,'users'), where('churchId','==', id)));
    await Promise.all(usersSnap.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(dbFire,'settings', id));
    await deleteDoc(doc(dbFire,'churches', id));
    UI.closeModal();
    toast('تم حذف الكنيسة وكل بياناتها نهائيًا');
  }catch(e){ console.error(e); toast('تعذر الحذف بالكامل: '+e.message); }
};

/* ---- دخول المالك مؤقتًا للوحة كنيسة معينة (للدعم الفني أو الاستخدام المباشر) ---- */
SuperAdmin.enterChurch = function(id){
  const c = byId(SA_CHURCHES, id);
  if(!c) return;
  UI.closeModal();
  detachListeners();
  IMPERSONATING = true;
  CURRENT_CHURCH_ID = id;
  CURRENT_CHURCH = c;
  document.getElementById('superadmin-app').style.display='none';
  document.getElementById('app').style.display='flex';
  document.getElementById('current-user-name').textContent = CURRENT_USER.name + ' (دعم فني)';
  document.getElementById('current-user-role').textContent = 'داخل لوحة: ' + c.name;
  document.getElementById('exit-impersonation-link').style.display='inline-block';
  buildNav();
  attachListeners(()=>{ App.navigate('dashboard'); });
  toast('دخلت لوحة كنيسة: ' + c.name);
};
App.exitImpersonation = function(){
  detachListeners();
  IMPERSONATING = false;
  CURRENT_CHURCH_ID = null;
  CURRENT_CHURCH = null;
  document.getElementById('app').style.display='none';
  document.getElementById('exit-impersonation-link').style.display='none';
  document.getElementById('superadmin-app').style.display='flex';
  document.getElementById('sa-user-name').textContent = CURRENT_USER.name;
  SuperAdmin.boot();
};

/* ---- طرق الدفع (تُدار من المالك، وتظهر لكل الكنايس) ---- */
SuperAdmin.renderMethods = function(el){
  el.innerHTML = `
    <div class="section-head"><h2>طرق الدفع المتاحة للكنايس</h2>
      <button class="btn btn-gold btn-sm" onclick="SuperAdmin.openMethodForm()">+ إضافة طريقة دفع</button>
    </div>
    <div class="info-card-grid">
      ${SA_METHODS.length ? SA_METHODS.map(m=>{
        const accs = methodAccountsOf(m);
        return `<div class="card card-pad">
        <div class="section-head" style="margin-bottom:6px;"><h2 style="font-size:14.5px;">${esc(m.name)}</h2>
          <span class="pill ${m.active!==false?'pill-active':'pill-inactive'}">${m.active!==false?'مفعّلة':'متوقفة'}</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${accs.map(a=>`
            <div style="display:flex; align-items:center; gap:8px;">
              ${a.image? `<img src="${a.image}" onclick="UI.previewImage('${a.image.replace(/'/g,"\\'")}')" style="width:40px; height:40px; border-radius:8px; object-fit:cover; border:1px solid var(--line); cursor:pointer; flex-shrink:0;">` : ''}
              <div style="font-size:13.5px; font-weight:800; color:var(--navy); font-family:'Markazi Text',serif;">${linkifyText(a.value)}</div>
            </div>
          `).join('')}
        </div>
        ${m.instructions?`<p class="muted" style="margin-top:6px;">${esc(m.instructions)}</p>`:''}
        <div class="row-actions" style="margin-top:12px;">
          <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.openMethodForm('${m.id}')">تعديل</button>
          <button class="btn btn-danger btn-sm" onclick="SuperAdmin.removeMethod('${m.id}')">حذف</button>
        </div>
      </div>`;}).join('') : `<p class="muted">لا توجد طرق دفع مضافة بعد.</p>`}
    </div>
  `;
};
/* توحيد شكل الحسابات بغض النظر عن الشكل القديم (نص فقط) أو الجديد ({value,image}) */
function methodAccountsOf(m){
  if(m.accounts && m.accounts.length && typeof m.accounts[0]==='object') return m.accounts;
  if(m.accounts && m.accounts.length) return m.accounts.map(v=>({value:v, image:m.qrImage||null}));
  return splitAccounts(m.details).map(v=>({value:v, image:m.qrImage||null}));
}
let METHOD_FORM_ACCOUNTS = [];
SuperAdmin.openMethodForm = function(id){
  const m = id ? SA_METHODS.find(x=>x.id===id) : {};
  METHOD_FORM_ACCOUNTS = id ? methodAccountsOf(m).map(a=>({...a})) : [{value:'', image:null}];
  if(!METHOD_FORM_ACCOUNTS.length) METHOD_FORM_ACCOUNTS = [{value:'', image:null}];
  UI.openModal(id?'تعديل طريقة دفع':'إضافة طريقة دفع', `
    <div class="field"><label>اسم طريقة الدفع</label><input id="f-name" value="${esc(m.name||'')}" placeholder="مثال: محفظة فودافون كاش"></div>
    <div class="field full">
      <label>الأرقام/الحسابات (كل رقم بصورته الخاصة بيه، عشان العميل ميتلخبطش)</label>
      <div id="method-accounts-list"></div>
      <button type="button" class="btn btn-ghost btn-sm" style="margin-top:6px;" onclick="SuperAdmin.addAccountRow()">+ إضافة رقم جديد</button>
    </div>
    <div class="field"><label>تعليمات إضافية (اختياري)</label><textarea id="f-instructions" rows="2">${esc(m.instructions||'')}</textarea></div>
    <label style="display:flex; align-items:center; gap:8px; font-weight:400; font-size:13px; margin-top:6px;">
      <input type="checkbox" id="f-active" ${m.active!==false?'checked':''}> طريقة دفع مفعّلة (تظهر للكنايس)
    </label>
  `, `<button class="btn btn-primary" onclick="SuperAdmin.saveMethod('${id||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
  SuperAdmin.renderAccountRows();
};
SuperAdmin.renderAccountRows = function(){
  const box = document.getElementById('method-accounts-list');
  if(!box) return;
  box.innerHTML = METHOD_FORM_ACCOUNTS.map((a,i)=>`
    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; padding:8px; border:1px solid var(--line); border-radius:10px;">
      <div style="width:52px; height:52px; border-radius:8px; overflow:hidden; background:var(--paper); display:flex; align-items:center; justify-content:center; flex-shrink:0; border:1px solid var(--line); ${a.image?'cursor:pointer;':''}" ${a.image?`onclick="UI.previewImage('${a.image.replace(/'/g,"\\'")}')"`:''}>
        ${a.image? `<img src="${a.image}" style="width:100%; height:100%; object-fit:cover;">` : '🖼️'}
      </div>
      <input value="${esc(a.value||'')}" placeholder="رقم الحساب أو رابط الدفع" oninput="METHOD_FORM_ACCOUNTS[${i}].value=this.value" style="flex:1;">
      <input type="file" accept="image/*" id="acc-file-${i}" style="display:none;" onchange="SuperAdmin.setAccountImage(${i})">
      <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('acc-file-${i}').click()">📷</button>
      <button type="button" class="btn btn-danger btn-sm" onclick="SuperAdmin.removeAccountRow(${i})">✖</button>
    </div>
  `).join('');
};
SuperAdmin.addAccountRow = function(){ METHOD_FORM_ACCOUNTS.push({value:'', image:null}); SuperAdmin.renderAccountRows(); };
SuperAdmin.removeAccountRow = function(i){
  METHOD_FORM_ACCOUNTS.splice(i,1);
  if(!METHOD_FORM_ACCOUNTS.length) METHOD_FORM_ACCOUNTS.push({value:'', image:null});
  SuperAdmin.renderAccountRows();
};
SuperAdmin.setAccountImage = async function(i){
  const file = document.getElementById('acc-file-'+i).files[0];
  if(!file) return;
  try{
    METHOD_FORM_ACCOUNTS[i].image = await smartImageUpload(file, 700, 0.7);
    SuperAdmin.renderAccountRows();
  }catch(e){ console.error(e); toast('تعذر رفع الصورة: '+e.message); }
};
SuperAdmin.saveMethod = async function(id){
  const name = document.getElementById('f-name').value.trim();
  const accounts = METHOD_FORM_ACCOUNTS.filter(a=>a.value && a.value.trim()).map(a=>({value:a.value.trim(), image:a.image||null}));
  if(!name||!accounts.length) return toast('أدخل اسم الطريقة ورقم/حساب واحد على الأقل');
  const data = { name, accounts, details: accounts.map(a=>a.value).join(', '), instructions: document.getElementById('f-instructions').value.trim(), active: document.getElementById('f-active').checked };
  try{
    if(id) await updateDoc(doc(dbFire,'paymentMethods',id), data);
    else await fsAddRaw('paymentMethods', data);
    UI.closeModal(); toast('تم الحفظ بنجاح');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.removeMethod = async function(id){
  if(!confirm('حذف طريقة الدفع دي؟')) return;
  try{ await deleteDoc(doc(dbFire,'paymentMethods',id)); toast('تم الحذف'); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---- مرفقات طريقة الدفع (صور QR/محافظ متعددة، مخزّنة في subcollection خاص بكل طريقة) ---- */
SuperAdmin.openAttachmentsModal = async function(methodId){
  const m = SA_METHODS.find(x=>x.id===methodId) || {};
  UI.openModal(`مرفقات: ${esc(m.name||'')}`, `
    <div id="pm-attachments-box"><p class="muted">جاري تحميل المرفقات...</p></div>
    <div class="field" style="margin-top:16px; border-top:1px solid var(--line); padding-top:16px;">
      <label>توضيح المرفق (مثال: رقم المحفظة أو اسم الفرع)</label>
      <input id="pm-att-label" placeholder="مثال: محفظة فودافون كاش - الفرع الرئيسي">
    </div>
    <div class="field"><label>الصورة</label><input type="file" id="pm-att-file" accept="image/*"></div>
    <p class="login-error" id="pm-att-error" style="display:block;"></p>
  `, `
    <button class="btn btn-primary" onclick="SuperAdmin.addAttachment('${methodId}')">+ إضافة المرفق</button>
    <button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>
  `);
  await SuperAdmin.renderAttachmentsList(methodId);
};
SuperAdmin.renderAttachmentsList = async function(methodId){
  const box = document.getElementById('pm-attachments-box');
  if(!box) return; // المودال اتقفل قبل ما التحميل يخلص
  try{
    const snap = await getDocs(collection(dbFire,'paymentMethods',methodId,'attachments'));
    const atts = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    box.innerHTML = atts.length ? `<div class="attachment-grid">
      ${atts.map(a=>`
        <div class="attachment-thumb">
          <img src="${a.img}" onclick="UI.previewImage('${(a.img||'').replace(/'/g,"\\'")}')">
          <small>${esc(a.label||'')}</small>
          <a class="att-remove" onclick="SuperAdmin.removeAttachment('${methodId}','${a.id}')">✖ حذف</a>
        </div>
      `).join('')}
    </div>` : `<p class="muted">لا توجد مرفقات مضافة لطريقة الدفع دي بعد.</p>`;
  }catch(e){ console.error(e); box.innerHTML = `<p class="muted">تعذر تحميل المرفقات.</p>`; }
};
SuperAdmin.addAttachment = async function(methodId){
  const labelInput = document.getElementById('pm-att-label');
  const fileInput = document.getElementById('pm-att-file');
  const errEl = document.getElementById('pm-att-error');
  const label = labelInput.value.trim();
  const file = fileInput.files[0];
  errEl.textContent = '';
  if(!file){ errEl.textContent = 'اختر صورة المرفق أولًا'; return; }
  if(!label){ errEl.textContent = 'اكتب توضيح للمرفق (زي رقم المحفظة) عشان الكنايس متتلخبطش'; return; }
  try{
    const img = await smartImageUpload(file, 700, 0.7);
    await addDoc(collection(dbFire,'paymentMethods',methodId,'attachments'), { label, img, createdAt: Date.now() });
    labelInput.value = ''; fileInput.value = '';
    await SuperAdmin.renderAttachmentsList(methodId);
    toast('تمت إضافة المرفق');
  }catch(e){ console.error(e); errEl.textContent = 'تعذر رفع المرفق: '+e.message; }
};
SuperAdmin.removeAttachment = async function(methodId, attId){
  if(!confirm('حذف هذا المرفق؟')) return;
  try{
    await deleteDoc(doc(dbFire,'paymentMethods',methodId,'attachments',attId));
    await SuperAdmin.renderAttachmentsList(methodId);
    toast('تم الحذف');
  }catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---- مراجعة إثباتات الدفع ---- */
SuperAdmin.renderPayments = function(el){
  const pending = SA_PROOFS.filter(p=>p.status==='pending');
  const done = SA_PROOFS.filter(p=>p.status!=='pending');
  el.innerHTML = `
    <div class="section-head"><h2>طلبات قيد المراجعة (${pending.length})</h2></div>
    <div class="info-card-grid" style="margin-bottom:26px;">
      ${pending.length ? pending.map(p=>SuperAdmin.proofCard(p)).join('') : `<p class="muted">لا توجد طلبات جديدة.</p>`}
    </div>
    <div class="section-head"><h2>طلبات سابقة</h2></div>
    <div class="info-card-grid">
      ${done.length ? done.map(p=>SuperAdmin.proofCard(p)).join('') : `<p class="muted">لا يوجد سجل بعد.</p>`}
    </div>
  `;
};
SuperAdmin.proofCard = function(p){
  const statusPill = p.status==='approved' ? '<span class="pill pill-active">تم القبول</span>'
    : p.status==='rejected' ? '<span class="pill pill-inactive">مرفوض</span>'
    : '<span class="church-status status-pending">قيد المراجعة</span>';
  return `<div class="card card-pad">
    <div class="section-head" style="margin-bottom:8px;"><h2 style="font-size:14.5px;">${esc(p.churchName||'—')}</h2>${statusPill}</div>
    <img src="${p.imageBase64}" style="width:100%; border-radius:8px; border:1px solid var(--line); margin-bottom:8px; cursor:pointer;" onclick="window.open('${p.imageBase64}','_blank')">
    <div class="kv" style="margin-bottom:8px;">
      <b>حوّل عن طريق</b><span>${esc(p.methodName||'—')}</span>
      <b>حوّل من</b><span style="font-weight:800; color:var(--navy);">${esc(p.senderAccount||'—')}</span>
      ${p.discountCode? `<b>كود خصم مُدخل</b><span style="font-family:monospace;">${esc(p.discountCode)}</span>`:''}
    </div>
    ${p.note? `<p class="muted">${esc(p.note)}</p>`:''}
    <p class="muted" style="font-size:11.5px;">${p.createdAt? fmtDate(new Date(p.createdAt).toISOString()):''}</p>
    ${p.status==='pending' ? `
      <div class="form-grid" style="margin:10px 0;">
        <div class="field" style="margin:0;"><label>عدد أيام التفعيل</label><input type="number" id="proof-days-${p.id}" value="30" min="1"></div>
      </div>
      <div class="row-actions" style="justify-content:flex-start;">
        <button class="btn btn-primary btn-sm" onclick="SuperAdmin.approveProof('${p.id}','${p.churchId}')">✅ قبول وتفعيل</button>
        <button class="btn btn-danger btn-sm" onclick="SuperAdmin.rejectProof('${p.id}')">رفض</button>
      </div>
    ` : ''}
  </div>`;
};
SuperAdmin.approveProof = async function(proofId, churchId){
  const daysInput = document.getElementById('proof-days-'+proofId);
  let days = Number(daysInput ? daysInput.value : 30) || 30;
  try{
    const c = SA_CHURCHES.find(x=>x.id===churchId) || {};
    const p = SA_PROOFS.find(x=>x.id===proofId) || {};
    let appliedCode = null;
    if(p.discountCode){
      const codeDoc = SA_DISCOUNT_CODES.find(x=> x.code===p.discountCode && x.active!==false
        && (!x.maxUses || (x.usedCount||0) < x.maxUses)
        && (!x.expiresAt || x.expiresAt >= todayISO()));
      if(codeDoc){
        days += (codeDoc.bonusDays||0);
        appliedCode = codeDoc;
        await updateDoc(doc(dbFire,'discountCodes',codeDoc.id), {usedCount: (codeDoc.usedCount||0)+1});
      }
    }
    const base = (c.status==='active' && c.activeUntil && new Date(c.activeUntil).getTime()>Date.now()) ? new Date(c.activeUntil).getTime() : Date.now();
    const activeUntil = new Date(base + days*86400000).toISOString();
    await updateDoc(doc(dbFire,'churches',churchId), {status:'active', activeUntil});
    await updateDoc(doc(dbFire,'paymentProofs',proofId), {status:'approved', reviewedAt: Date.now()});
    await saLog('قبول دفع وتفعيل اشتراك', `${c.name||churchId} — ${days} يوم${appliedCode?` (منهم ${appliedCode.bonusDays} من كود ${appliedCode.code})`:''}`);
    toast(appliedCode ? `تم القبول وتفعيل الاشتراك ${days} يوم (منهم ${appliedCode.bonusDays} من كود الخصم)` : 'تم القبول وتفعيل الاشتراك '+days+' يوم');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.rejectProof = async function(proofId){
  if(!confirm('تأكيد رفض إثبات الدفع ده؟')) return;
  try{
    await updateDoc(doc(dbFire,'paymentProofs',proofId), {status:'rejected', reviewedAt: Date.now()});
    await saLog('رفض إثبات دفع', proofId);
    toast('تم الرفض');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};

/* ---- الدردشات مع الكنايس ---- */
SuperAdmin.renderChats = function(el){
  if(!SA_CHAT_CHURCH_ID){
    const sorted = [...SA_CHURCHES].sort((a,b)=> (SA_UNREAD_BY_CHURCH[b.id]?1:0) - (SA_UNREAD_BY_CHURCH[a.id]?1:0));
    el.innerHTML = `<div class="section-head"><h2>اختر كنيسة للدردشة معها</h2></div>
      <div class="info-card-grid">
        ${sorted.length ? sorted.map(c=>{
          const unread = SA_UNREAD_BY_CHURCH[c.id]||0;
          return `<div class="church-card" style="position:relative;" onclick="SuperAdmin.openChat('${c.id}','${esc(c.name)}')">
            <h3>${esc(c.name)}${unread? ` <span class="badge-count" style="display:inline-block; margin-right:6px;">${unread}</span>`:''}</h3>
          </div>`;
        }).join('')
          : `<p class="muted">لا توجد كنايس مسجلة بعد.</p>`}
      </div>`;
    return;
  }
  const c = SA_CHURCHES.find(x=>x.id===SA_CHAT_CHURCH_ID);
  el.innerHTML = `
    <button class="btn btn-ghost btn-sm" style="margin-bottom:14px;" onclick="SuperAdmin.closeChat()">→ رجوع لكل الدردشات</button>
    <div class="card" style="display:flex; flex-direction:column; height:60vh;">
      <div style="padding:12px 16px; border-bottom:1px solid var(--line); font-weight:700; color:var(--navy);">${esc(c?c.name:'')}</div>
      <div id="sa-chat-messages" style="flex:1; overflow-y:auto; padding:16px;"></div>
      <div style="display:flex; gap:8px; padding:12px; border-top:1px solid var(--line); align-items:center;">
        <label class="btn btn-ghost btn-sm" style="margin:0; cursor:pointer;">📎<input type="file" id="sa-chat-file" accept="image/*" style="display:none;" onchange="SuperAdmin.previewChatFile()"></label>
        <input id="sa-chat-input" placeholder="اكتب ردك..." style="flex:1; padding:10px 12px; border:1px solid var(--line); border-radius:8px;" onkeydown="if(event.key==='Enter') SuperAdmin.sendChat()">
        <button class="btn btn-primary" onclick="SuperAdmin.sendChat()">إرسال</button>
      </div>
      <div id="sa-chat-file-preview" style="display:none; padding:0 12px 12px;"></div>
    </div>
  `;
  SuperAdmin.renderChatMessages();
};
SuperAdmin.previewChatFile = function(){
  const file = document.getElementById('sa-chat-file').files[0];
  const box = document.getElementById('sa-chat-file-preview');
  if(!file){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='block';
  box.innerHTML = `<span class="pill pill-active">📎 ${esc(file.name)}</span> <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.clearChatFile()">إلغاء</button>`;
};
SuperAdmin.clearChatFile = function(){
  document.getElementById('sa-chat-file').value='';
  const box = document.getElementById('sa-chat-file-preview');
  box.style.display='none'; box.innerHTML='';
};
SuperAdmin.openChat = function(churchId){
  SA_CHAT_CHURCH_ID = churchId;
  if(saChatUnsub) saChatUnsub();
  saChatUnsub = onSnapshot(query(collection(dbFire,'chatMessages'), where('churchId','==',churchId)), snap=>{
    SA_CHAT_MESSAGES = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    if(SA_PAGE==='chats' && SA_CHAT_CHURCH_ID===churchId){
      SuperAdmin.renderChatMessages();
      markChatRead(SA_CHAT_MESSAGES.filter(m=>m.senderRole!=='superadmin'), 'readBySA');
    }
  }, err=>console.error(err));
  SuperAdmin.render();
};
SuperAdmin.closeChat = function(){
  SA_CHAT_CHURCH_ID = null;
  if(saChatUnsub){ saChatUnsub(); saChatUnsub=null; }
  SuperAdmin.render();
};
SuperAdmin.renderChatMessages = function(){
  const el = document.getElementById('sa-chat-messages');
  if(!el) return;
  el.innerHTML = SA_CHAT_MESSAGES.length ? SA_CHAT_MESSAGES.map(m=>{
    const mine = m.senderRole === 'superadmin';
    return `<div style="display:flex; ${mine?'justify-content:flex-end;':'justify-content:flex-start;'} margin-bottom:10px;">
      <div style="max-width:72%; padding:9px 13px; border-radius:12px; font-size:13.5px; ${mine?'background:var(--navy); color:#fff;':'background:var(--paper); color:var(--ink);'}">
        <div style="display:flex; justify-content:space-between; gap:10px; font-size:11px; opacity:.7; margin-bottom:3px;">
          <span>${esc(m.senderName)}</span>
          <a style="cursor:pointer; ${mine?'color:#fff;':'color:var(--absent);'}" title="حذف الرسالة" onclick="deleteChatMessage('${m.id}')">🗑</a>
        </div>
        ${m.imageBase64? chatAttachmentThumb(m.imageBase64) : ''}
        ${m.text? esc(m.text) : ''}
      </div>
    </div>`;
  }).join('') : `<p class="muted" style="text-align:center; margin-top:30px;">لا توجد رسائل بعد.</p>`;
  el.scrollTop = el.scrollHeight;
};
SuperAdmin.sendChat = async function(){
  const input = document.getElementById('sa-chat-input');
  const fileInput = document.getElementById('sa-chat-file');
  const text = input.value.trim();
  const file = fileInput.files[0];
  if((!text && !file) || !SA_CHAT_CHURCH_ID) return;
  input.value='';
  try{
    const payload = { churchId: SA_CHAT_CHURCH_ID, senderRole:'superadmin', senderName: CURRENT_USER.name, text, createdAt: Date.now(), readBySA:true, readByChurch:false };
    if(file) payload.imageBase64 = await smartImageUpload(file, 900, 0.6);
    await addDoc(collection(dbFire,'chatMessages'), payload);
    SuperAdmin.clearChatFile();
  }catch(e){ console.error(e); toast('تعذر إرسال الرسالة: '+e.message); }
};

/* ---- التذاكر (الدعم الفني/الشكاوى) عبر كل الكنايس ---- */
/* أنواع تذاكر افتراضية مناسبة لسياق نظام إدارة مدارس الأحد (SaaS) */
const DEFAULT_TICKET_TYPES = [
  'استفسار عن الاشتراك أو الاستخدام',
  'مشكلة في الدفع أو الفاتورة',
  'مشكلة تقنية أو خطأ في النظام',
  'طلب تعديل بيانات الكنيسة',
  'مشكلة في تسجيل الدخول أو الحساب',
  'شكوى بخصوص جودة الخدمة',
  'اقتراح أو ملاحظة عامة',
  'شكوى أخرى',
];
let SA_SEEDING_TICKET_TYPES = false;
SuperAdmin.seedDefaultTicketTypes = async function(){
  if(SA_SEEDING_TICKET_TYPES) return;
  SA_SEEDING_TICKET_TYPES = true;
  try{ await setDoc(doc(dbFire,'ticketTypes','main'), { types: DEFAULT_TICKET_TYPES }, {merge:true}); }
  catch(e){ console.error(e); }
  finally{ SA_SEEDING_TICKET_TYPES = false; }
};
SuperAdmin.renderTickets = function(el){
  const types = TICKET_TYPES;
  if(!types.length && !SA_SEEDING_TICKET_TYPES) SuperAdmin.seedDefaultTicketTypes();
  let filtered = SA_TICKETS.slice();
  if(SA_TICKET_FILTERS.type) filtered = filtered.filter(t=>t.type===SA_TICKET_FILTERS.type);
  if(SA_TICKET_FILTERS.status) filtered = filtered.filter(t=>t.status===SA_TICKET_FILTERS.status);
  if(SA_TICKET_FILTERS.search) filtered = filtered.filter(t=> (t.ticketNo||'').toLowerCase().includes(SA_TICKET_FILTERS.search.toLowerCase()));
  if(SA_TICKET_FILTERS.from) filtered = filtered.filter(t=> new Date(t.createdAt).toISOString().slice(0,10) >= SA_TICKET_FILTERS.from);
  if(SA_TICKET_FILTERS.to) filtered = filtered.filter(t=> new Date(t.createdAt).toISOString().slice(0,10) <= SA_TICKET_FILTERS.to);

  el.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">🎫 أنواع الشكاوى (تظهر للعميل عند فتح تذكرة)</b>
      <div style="display:flex; gap:8px; margin-bottom:10px;">
        <input id="new-ticket-type" placeholder="اكتب نوع شكوى جديد..." style="flex:1; padding:8px 10px; border:1px solid var(--line); border-radius:8px;" onkeydown="if(event.key==='Enter'){SuperAdmin.addTicketType();}">
        <button class="btn btn-primary btn-sm" onclick="SuperAdmin.addTicketType()">+ إضافة</button>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px;">
        ${types.length ? types.map(t=>`<span class="pill status-pending" style="display:inline-flex; align-items:center; gap:8px; padding:6px 12px;">
            ${esc(t)}
            <a style="cursor:pointer;" title="تعديل" onclick="SuperAdmin.editTicketType('${esc(t).replace(/'/g,"\\'")}')">✏️</a>
            <a style="cursor:pointer; color:var(--absent);" title="حذف" onclick="SuperAdmin.removeTicketType('${esc(t).replace(/'/g,"\\'")}')">✖</a>
          </span>`).join('') : `<span class="muted">جاري تجهيز قائمة افتراضية...</span>`}
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <div class="toolbar">
        <div class="field" style="margin:0;"><label>من الفترة</label><input type="date" id="tk-f-from" value="${SA_TICKET_FILTERS.from||''}"></div>
        <div class="field" style="margin:0;"><label>الي الفترة</label><input type="date" id="tk-f-to" value="${SA_TICKET_FILTERS.to||''}"></div>
        <div class="field" style="margin:0;"><label>نوع الشكوي</label>
          <select id="tk-f-type"><option value="">الكل</option>${types.map(t=>`<option value="${esc(t)}" ${SA_TICKET_FILTERS.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select>
        </div>
        <div class="field" style="margin:0;"><label>الحالة</label>
          <select id="tk-f-status"><option value="">الكل</option>${Object.keys(TICKET_STATUS_CLASS).map(s=>`<option value="${s}" ${SA_TICKET_FILTERS.status===s?'selected':''}>${s}</option>`).join('')}</select>
        </div>
        <div class="field" style="margin:0;"><label>بحث برقم التذكرة</label><input id="tk-f-search" value="${esc(SA_TICKET_FILTERS.search)}" placeholder="مثال: TKT-558163"></div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
        <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.resetTicketFilters()">إعادة تعيين</button>
        <button class="btn btn-primary btn-sm" onclick="SuperAdmin.applyTicketFilters()">عرض التذاكر</button>
      </div>
    </div>

    <div class="card" style="padding:0;">
      ${filtered.length ? filtered.map(t=>{
        const church = SA_CHURCHES.find(c=>c.id===t.churchId);
        return `<div style="padding:12px 16px; border-bottom:1px solid var(--line); cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:10px; ${t.readBySA===false?'background:#FBF6EC;':''}" onclick="SuperAdmin.openTicketDetail('${t.id}')">
          <div>
            <b style="font-size:13px;">${esc(t.ticketNo)} — ${esc(t.title)}</b>
            <div class="muted" style="font-size:11.5px; margin-top:2px;">${esc(church?church.name:'')} · ${esc(t.type||'')} · ${new Date(t.createdAt).toLocaleDateString('ar-EG')}</div>
          </div>
          ${ticketStatusPill(t.status)}
        </div>`;
      }).join('') : `<p class="muted" style="padding:16px;">لا توجد تذاكر تحتاج متابعة حاليًا. استخدم الفلترة فوق لعرض كل التذاكر (بما فيها المقفولة والملغاة).</p>`}
    </div>
  `;
};
SuperAdmin.applyTicketFilters = function(){
  SA_TICKET_FILTERS = {
    type: document.getElementById('tk-f-type').value,
    status: document.getElementById('tk-f-status').value,
    search: document.getElementById('tk-f-search').value.trim(),
    from: document.getElementById('tk-f-from').value,
    to: document.getElementById('tk-f-to').value,
  };
  SuperAdmin.render();
};
SuperAdmin.resetTicketFilters = function(){ SA_TICKET_FILTERS = {type:'', status:'', search:'', from:'', to:''}; SuperAdmin.render(); };
SuperAdmin.addTicketType = async function(){
  const input = document.getElementById('new-ticket-type');
  const val = input.value.trim();
  if(!val) return;
  if(TICKET_TYPES.includes(val)){ toast('النوع ده موجود بالفعل'); return; }
  try{ await setDoc(doc(dbFire,'ticketTypes','main'), { types:[...TICKET_TYPES, val] }, {merge:true}); input.value=''; }
  catch(e){ console.error(e); toast('تعذر الإضافة: '+e.message); }
};
SuperAdmin.editTicketType = async function(oldName){
  const newName = prompt('عدّل اسم نوع الشكوى:', oldName);
  if(newName===null) return; // إلغاء
  const val = newName.trim();
  if(!val || val===oldName) return;
  if(TICKET_TYPES.includes(val)){ toast('النوع ده موجود بالفعل'); return; }
  try{
    const updated = TICKET_TYPES.map(t=> t===oldName ? val : t);
    await setDoc(doc(dbFire,'ticketTypes','main'), { types: updated }, {merge:true});
    toast('تم التعديل (التذاكر القديمة بنفس النوع القديم هتفضل زي ما هي)');
  }catch(e){ console.error(e); toast('تعذر التعديل: '+e.message); }
};
SuperAdmin.removeTicketType = async function(name){
  if(!confirm('حذف نوع الشكوى ده؟ (مش هيأثر على التذاكر القديمة اللي مستخدماه بالفعل)')) return;
  try{ await setDoc(doc(dbFire,'ticketTypes','main'), { types: TICKET_TYPES.filter(t=>t!==name) }, {merge:true}); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};
SuperAdmin.openTicketDetail = function(id){
  const t = SA_TICKETS.find(x=>x.id===id);
  if(!t) return;
  const church = SA_CHURCHES.find(c=>c.id===t.churchId);
  UI.openModal(t.ticketNo, `
    ${ticketStatusPill(t.status)}
    <h3 style="margin:10px 0 4px; font-size:15px;">${esc(t.title)}</h3>
    <p class="muted" style="font-size:11.5px; margin-bottom:10px;">${esc(church?church.name:'')} · ${esc(t.createdByName||'')} · ${esc(t.type||'')} · ${new Date(t.createdAt).toLocaleString('ar-EG')}</p>
    <p style="white-space:pre-wrap; font-size:13.5px;">${esc(t.description)}</p>
    ${t.attachmentImg? `<img src="${t.attachmentImg}" style="max-width:160px; border-radius:8px; margin-top:10px; cursor:pointer; border:1px solid var(--line);" onclick="UI.previewImage('${t.attachmentImg.replace(/'/g,"\\'")}')">`:''}
    <div class="field" style="margin-top:16px; border-top:1px solid var(--line); padding-top:14px;">
      <label>الحالة</label>
      <select id="tk-status-update">
        ${Object.keys(TICKET_STATUS_CLASS).map(s=>`<option value="${s}" ${t.status===s?'selected':''}>${s}</option>`).join('')}
      </select>
    </div>
    <div class="field"><label>الرد على الكنيسة</label><textarea id="tk-reply" rows="3" placeholder="اكتب ردك هنا...">${esc(t.adminReply||'')}</textarea></div>
  `, `<button class="btn btn-primary" onclick="SuperAdmin.saveTicketUpdate('${t.id}')">💾 حفظ وإرسال للكنيسة</button><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>`);
  if(t.readBySA===false) markChatRead([t], 'readBySA', 'tickets');
};
SuperAdmin.saveTicketUpdate = async function(id){
  const status = document.getElementById('tk-status-update').value;
  const reply = document.getElementById('tk-reply').value.trim();
  try{
    await updateDoc(doc(dbFire,'tickets',id), { status, adminReply:reply, hasAdminUpdate:true, updatedAt: Date.now(), readByChurch:false });
    UI.closeModal();
    toast('تم الحفظ وإرسال الرد للكنيسة');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};

/* ---- الروابط: تواصل معنا العام (لأي زائر) + روابط إدارية سريعة (خاصة بالمالك) ---- */
SuperAdmin.renderLinks = function(el){
  const currentTheme = SA_PUBLIC_CONFIG.theme || 'classic';
  const ann = SA_PUBLIC_CONFIG.announcement || {};
  el.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">📢 شريط إعلان/تنويه متحرك (يظهر لكل الزوار والكنايس أعلى الصفحة)</b>
      <label style="display:flex; align-items:center; gap:8px; font-weight:400; font-size:13px; margin-bottom:10px;">
        <input type="checkbox" id="ann-enabled" ${ann.enabled?'checked':''}> تفعيل الشريط
      </label>
      <div class="field"><label>نص الإعلان</label><input id="ann-text" value="${esc(ann.text||'')}" placeholder="مثال: تم إضافة ميزة التذاكر الجديدة، جرّبها الآن!"></div>
      <button class="btn btn-primary btn-sm" onclick="SuperAdmin.saveAnnouncement()">حفظ الإعلان</button>
      <p class="muted" style="margin-top:6px;">أي حد يقدر يقفله مؤقتًا لنفسه بـ×، وهيرجع يظهر تاني لما يفتح الصفحة من جديد طالما لسه مفعّل.</p>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">🎨 مظهر النظام (يظهر لكل الكنايس دفعة واحدة)</b>
      <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(130px,1fr)); gap:10px;">
        ${Object.entries(THEME_PRESETS).map(([k,t])=>`
          <div onclick="SuperAdmin.saveTheme('${k}')" style="cursor:pointer; border:2px solid ${currentTheme===k?'var(--gold)':'var(--line)'}; border-radius:10px; padding:10px; text-align:center;">
            <div style="display:flex; height:28px; border-radius:6px; overflow:hidden; margin-bottom:8px;">
              <div style="flex:1; background:${t.navy};"></div><div style="flex:1; background:${t.gold};"></div>
            </div>
            <span style="font-size:12px;">${t.label}${currentTheme===k?' ✓':''}</span>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">📞 تواصل معنا (يظهر لأي زائر في صفحة الدخول قبل ما يسجّل)</b>
      <div class="form-grid">
        <div class="field"><label>واتساب (رابط wa.me كامل)</label><input id="pc-whatsapp" value="${esc(SA_PUBLIC_CONFIG.contacts?.whatsapp||'')}" placeholder="https://wa.me/2010xxxxxxxx"></div>
        <div class="field"><label>فيسبوك</label><input id="pc-facebook" value="${esc(SA_PUBLIC_CONFIG.contacts?.facebook||'')}" placeholder="https://facebook.com/..."></div>
        <div class="field"><label>إنستجرام</label><input id="pc-instagram" value="${esc(SA_PUBLIC_CONFIG.contacts?.instagram||'')}" placeholder="https://instagram.com/..."></div>
        <div class="field"><label>تليجرام</label><input id="pc-telegram" value="${esc(SA_PUBLIC_CONFIG.contacts?.telegram||'')}" placeholder="https://t.me/..."></div>
        <div class="field"><label>إنستجرام</label><input id="pc-instagram" value="${esc(SA_PUBLIC_CONFIG.contacts?.instagram||'')}" placeholder="https://instagram.com/..."></div>
        <div class="field"><label>البريد الإلكتروني</label><input id="pc-email" value="${esc(SA_PUBLIC_CONFIG.contacts?.email||'')}" placeholder="support@example.com"></div>
        <div class="field"><label>رقم الاتصال المباشر</label><input id="pc-phone" value="${esc(SA_PUBLIC_CONFIG.contacts?.phone||'')}" placeholder="0100xxxxxxx"></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="SuperAdmin.savePublicContact()">حفظ قنوات التواصل</button>
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">🔗 إضافة رابط إداري جديد</b>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        <input id="al-name" placeholder="اسم الرابط — مثال: مستودع الكود" style="flex:1; min-width:160px;">
        <input id="al-url" placeholder="https://..." style="flex:1; min-width:160px;">
        <button class="btn btn-primary btn-sm" onclick="SuperAdmin.addAdminLink()">+ حفظ الرابط</button>
      </div>
    </div>

    <div class="card" style="padding:0;">
      ${SA_ADMIN_LINKS.length ? SA_ADMIN_LINKS.map(l=>`
        <div style="padding:12px 16px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>
            <b style="font-size:13px;">${esc(l.name)}</b>
            ${l.isDeleteAccountsLink? `<span class="pill status-trial" style="margin-right:6px;">⭐ رابط حذف الحسابات</span>`:''}
            <div class="muted" style="font-size:11.5px; word-break:break-all;">${esc(l.url)}</div>
          </div>
          <div class="row-actions">
            <a class="btn btn-ghost btn-sm" href="${esc(l.url)}" target="_blank" rel="noopener">فتح</a>
            <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.editAdminLink('${l.id}')">تعديل</button>
            <button class="btn btn-ghost btn-sm" title="تحديد كرابط حذف الحسابات" onclick="SuperAdmin.markDeleteAccountsLink('${l.id}')">⭐ ${l.isDeleteAccountsLink?'إلغاء التحديد':'تحديد'}</button>
            <button class="btn btn-danger btn-sm" onclick="SuperAdmin.removeAdminLink('${l.id}')">حذف</button>
          </div>
        </div>
      `).join('') : `<p class="muted" style="padding:16px;">لا توجد روابط إدارية مضافة بعد.</p>`}
    </div>
  `;
};
SuperAdmin.saveAnnouncement = async function(){
  const enabled = document.getElementById('ann-enabled').checked;
  const text = document.getElementById('ann-text').value.trim();
  try{
    await setDoc(doc(dbFire,'platformConfig','public'), { announcement: {enabled, text} }, {merge:true});
    toast('تم الحفظ');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.saveTheme = async function(key){
  try{ await setDoc(doc(dbFire,'platformConfig','public'), { theme: key }, {merge:true}); applyTheme(key); toast('تم تطبيق المظهر الجديد لكل الزوار'); }
  catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.savePublicContact = async function(){
  const contacts = {
    whatsapp: document.getElementById('pc-whatsapp').value.trim(),
    facebook: document.getElementById('pc-facebook').value.trim(),
    instagram: document.getElementById('pc-instagram').value.trim(),
    telegram: document.getElementById('pc-telegram').value.trim(),
    instagram: document.getElementById('pc-instagram').value.trim(),
    email: document.getElementById('pc-email').value.trim(),
    phone: document.getElementById('pc-phone').value.trim(),
  };
  try{ await setDoc(doc(dbFire,'platformConfig','public'), { contacts }, {merge:true}); toast('تم الحفظ'); }
  catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.addAdminLink = async function(){
  const name = document.getElementById('al-name').value.trim();
  const url = document.getElementById('al-url').value.trim();
  if(!name||!url){ toast('أدخل اسم الرابط والعنوان'); return; }
  try{
    await fsAddRaw('adminLinks', {name, url});
    document.getElementById('al-name').value=''; document.getElementById('al-url').value='';
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.editAdminLink = async function(id){
  const l = SA_ADMIN_LINKS.find(x=>x.id===id);
  if(!l) return;
  const name = prompt('اسم الرابط:', l.name);
  if(name===null) return;
  const url = prompt('عنوان الرابط:', l.url);
  if(url===null) return;
  try{ await updateDoc(doc(dbFire,'adminLinks',id), {name:name.trim(), url:url.trim()}); }
  catch(e){ console.error(e); toast('تعذر التعديل: '+e.message); }
};
SuperAdmin.markDeleteAccountsLink = async function(id){
  try{
    const batch = writeBatch(dbFire);
    SA_ADMIN_LINKS.forEach(l=>{
      const shouldBe = l.id===id ? !l.isDeleteAccountsLink : false;
      if(!!l.isDeleteAccountsLink !== shouldBe) batch.update(doc(dbFire,'adminLinks',l.id), {isDeleteAccountsLink: shouldBe});
    });
    await batch.commit();
  }catch(e){ console.error(e); toast('تعذر التحديث: '+e.message); }
};
SuperAdmin.removeAdminLink = async function(id){
  if(!confirm('حذف هذا الرابط؟')) return;
  try{ await deleteDoc(doc(dbFire,'adminLinks',id)); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---- سجل نشاط المالك (آخر حركاته: قبول/رفض/تمديد/إعفاء... إلخ) ---- */
SuperAdmin.renderActivity = function(el){
  let rows = SA_ACTIVITY_LOG.slice();
  if(SA_ACTIVITY_FILTERS.from) rows = rows.filter(l=> new Date(l.date).toISOString().slice(0,10) >= SA_ACTIVITY_FILTERS.from);
  if(SA_ACTIVITY_FILTERS.to) rows = rows.filter(l=> new Date(l.date).toISOString().slice(0,10) <= SA_ACTIVITY_FILTERS.to);
  el.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <p class="muted" style="margin-bottom:10px;">سجل حركاتك كمالك للنظام (قبول/رفض طلبات، تمديد اشتراكات، إعفاءات، مراجعة مدفوعات...). يظهر افتراضيًا آخر 300 حركة.</p>
      <div class="toolbar">
        <div class="field" style="margin:0;"><label>من الفترة</label><input type="date" id="ac-f-from" value="${SA_ACTIVITY_FILTERS.from}"></div>
        <div class="field" style="margin:0;"><label>الي الفترة</label><input type="date" id="ac-f-to" value="${SA_ACTIVITY_FILTERS.to}"></div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
        <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.resetActivityFilters()">إعادة تعيين</button>
        <button class="btn btn-primary btn-sm" onclick="SuperAdmin.applyActivityFilters()">عرض السجل</button>
      </div>
    </div>
    <div class="card">
      ${rows.length ? `<table><thead><tr><th>التاريخ</th><th>الإجراء</th><th>التفاصيل</th></tr></thead>
      <tbody>${rows.map(l=>`<tr><td>${new Date(l.date).toLocaleString('ar-EG')}</td><td><b>${esc(l.action)}</b></td><td class="muted">${esc(l.details)}</td></tr>`).join('')}</tbody></table>`
      : `<p class="muted" style="padding:16px;">لا توجد حركات مسجّلة في هذه الفترة.</p>`}
    </div>
  `;
};
SuperAdmin.applyActivityFilters = function(){
  SA_ACTIVITY_FILTERS = { from: document.getElementById('ac-f-from').value, to: document.getElementById('ac-f-to').value };
  SuperAdmin.render();
};
SuperAdmin.resetActivityFilters = function(){ SA_ACTIVITY_FILTERS = {from:'', to:''}; SuperAdmin.render(); };

/* ---- تقرير شامل: إحصائيات الكنايس وطلبات الدفع خلال فترة ---- */
const CHURCH_STATUS_LABELS = {pending:'قيد المراجعة', trial:'تجربة مجانية', active:'نشطة', expired:'منتهية', rejected:'مرفوضة', exempt:'معفاة'};
SuperAdmin.renderReport = function(el){
  let churches = SA_CHURCHES.slice();
  if(SA_REPORT_FILTERS.from) churches = churches.filter(c=> !c.createdAt || new Date(c.createdAt).toISOString().slice(0,10) >= SA_REPORT_FILTERS.from);
  if(SA_REPORT_FILTERS.to) churches = churches.filter(c=> !c.createdAt || new Date(c.createdAt).toISOString().slice(0,10) <= SA_REPORT_FILTERS.to);
  if(SA_REPORT_FILTERS.category) churches = churches.filter(c=> c.status===SA_REPORT_FILTERS.category);

  const byStatus = {};
  churches.forEach(c=>{ byStatus[c.status] = (byStatus[c.status]||0)+1; });
  const proofsApproved = SA_PROOFS.filter(p=>p.status==='approved').length;
  const proofsPending = SA_PROOFS.filter(p=>p.status==='pending').length;
  const proofsRejected = SA_PROOFS.filter(p=>p.status==='rejected').length;

  el.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <p class="muted" style="margin-bottom:10px;">التقرير يفتح افتراضيًا على كل الكنايس المسجلة. اختر فترة أو فئة حالة معيّنة واضغط "توليد التقرير".</p>
      <div class="toolbar">
        <div class="field" style="margin:0;"><label>من تاريخ</label><input type="date" id="rp-f-from" value="${SA_REPORT_FILTERS.from}"></div>
        <div class="field" style="margin:0;"><label>إلى تاريخ</label><input type="date" id="rp-f-to" value="${SA_REPORT_FILTERS.to}"></div>
        <div class="field" style="margin:0;"><label>فئة الكنايس (الحالة)</label>
          <select id="rp-f-category"><option value="">كل الفئات</option>${Object.entries(CHURCH_STATUS_LABELS).map(([k,v])=>`<option value="${k}" ${SA_REPORT_FILTERS.category===k?'selected':''}>${v}</option>`).join('')}</select>
        </div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
        <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.resetReportFilters()">إعادة تعيين</button>
        <button class="btn btn-primary btn-sm" onclick="SuperAdmin.applyReportFilters()">📊 توليد التقرير</button>
      </div>
    </div>

    <div class="info-card-grid" style="margin-bottom:16px;">
      <div class="stat-card"><div class="stat-num">${churches.length}</div><div>إجمالي عدد الكنايس</div></div>
      <div class="stat-card"><div class="stat-num">${byStatus.active||0}</div><div>كنايس نشطة</div></div>
      <div class="stat-card"><div class="stat-num">${byStatus.trial||0}</div><div>تحت التجربة</div></div>
      <div class="stat-card bad"><div class="stat-num">${byStatus.expired||0}</div><div>اشتراك منتهي</div></div>
      <div class="stat-card"><div class="stat-num">${proofsApproved}</div><div>طلبات دفع مقبولة</div></div>
      <div class="stat-card bad"><div class="stat-num">${proofsPending}</div><div>طلبات دفع قيد المراجعة</div></div>
    </div>

    <div class="section-head"><h2>توزيع الكنايس حسب الحالة</h2></div>
    <div class="card"><table><thead><tr><th>الحالة</th><th>عدد الكنايس</th></tr></thead>
      <tbody>${Object.keys(byStatus).length ? Object.entries(byStatus).map(([k,v])=>`<tr><td>${CHURCH_STATUS_LABELS[k]||k}</td><td>${v}</td></tr>`).join('') : `<tr><td colspan="2" class="muted">لا توجد كنايس مطابقة لهذه الفلاتر</td></tr>`}</tbody>
    </table></div>
  `;
};
SuperAdmin.applyReportFilters = function(){
  SA_REPORT_FILTERS = {
    from: document.getElementById('rp-f-from').value,
    to: document.getElementById('rp-f-to').value,
    category: document.getElementById('rp-f-category').value,
  };
  SuperAdmin.render();
};
SuperAdmin.resetReportFilters = function(){ SA_REPORT_FILTERS = {from:'', to:'', category:''}; SuperAdmin.render(); };

/* ---- الخطط والعروض: خطط اشتراك معلنة + أكواد خصم/أيام إضافية ---- */
SuperAdmin.renderPlans = function(el){
  el.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">💳 إضافة خطة اشتراك جديدة (تظهر للكنايس كمعلومة توضيحية)</b>
      <div class="form-grid">
        <div class="field"><label>اسم الخطة</label><input id="pl-name" placeholder="مثال: الباقة السنوية"></div>
        <div class="field"><label>السعر (جنيه)</label><input id="pl-price" type="number" placeholder="مثال: 600"></div>
        <div class="field"><label>المدة (يوم)</label><input id="pl-days" type="number" placeholder="مثال: 365"></div>
        <div class="field full"><label>المميزات (كل ميزة في سطر)</label><textarea id="pl-features" rows="3" placeholder="عدد غير محدود من المخدومين&#10;دعم فني أولوية"></textarea></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="SuperAdmin.addPlan()">+ حفظ الخطة</button>
    </div>
    <div class="card" style="margin-bottom:24px;">
      ${SA_PLANS.length ? SA_PLANS.map(p=>`
        <div style="padding:12px 16px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div><b>${esc(p.name)}</b> — <span class="muted">${p.price||0} ج.م / ${p.durationDays||0} يوم</span>
            ${p.features&&p.features.length? `<div class="muted" style="font-size:11.5px; margin-top:3px;">${p.features.map(f=>esc(f)).join(' · ')}</div>`:''}
          </div>
          <button class="btn btn-danger btn-sm" onclick="SuperAdmin.removePlan('${p.id}')">حذف</button>
        </div>
      `).join('') : `<p class="muted" style="padding:16px;">لا توجد خطط مضافة بعد.</p>`}
    </div>

    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">🎁 إضافة كود خصم/أيام إضافية جديد</b>
      <div class="form-grid">
        <div class="field"><label>الكود</label><input id="dc-code" placeholder="مثال: CHURCH50" style="text-transform:uppercase;"></div>
        <div class="field"><label>عدد الأيام الإضافية</label><input id="dc-days" type="number" placeholder="مثال: 15"></div>
        <div class="field"><label>حد الاستخدام (اختياري)</label><input id="dc-maxuses" type="number" placeholder="اتركه فارغ = بلا حدود"></div>
        <div class="field"><label>تاريخ الانتهاء (اختياري)</label><input id="dc-expires" type="date"></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="SuperAdmin.addDiscountCode()">+ حفظ الكود</button>
    </div>
    <div class="card">
      ${SA_DISCOUNT_CODES.length ? SA_DISCOUNT_CODES.map(c=>`
        <div style="padding:12px 16px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div>
            <b style="font-family:monospace; letter-spacing:1px;">${esc(c.code)}</b> — <span class="muted">+${c.bonusDays||0} يوم</span>
            <div class="muted" style="font-size:11.5px; margin-top:3px;">استُخدم ${c.usedCount||0}${c.maxUses?` / ${c.maxUses}`:''} مرة${c.expiresAt? ` · ينتهي في ${fmtDate(c.expiresAt)}`:''}</div>
          </div>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.toggleDiscountCode('${c.id}', ${c.active===false})">${c.active===false?'تفعيل':'إيقاف'}</button>
            <button class="btn btn-danger btn-sm" onclick="SuperAdmin.removeDiscountCode('${c.id}')">حذف</button>
          </div>
        </div>
      `).join('') : `<p class="muted" style="padding:16px;">لا توجد أكواد خصم مضافة بعد.</p>`}
    </div>
  `;
};
SuperAdmin.addPlan = async function(){
  const name = document.getElementById('pl-name').value.trim();
  const price = Number(document.getElementById('pl-price').value)||0;
  const durationDays = Number(document.getElementById('pl-days').value)||0;
  const features = document.getElementById('pl-features').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!name){ toast('أدخل اسم الخطة'); return; }
  try{ await fsAddRaw('subscriptionPlans', {name, price, durationDays, features, active:true}); toast('تمت إضافة الخطة'); }
  catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.removePlan = async function(id){
  if(!confirm('حذف هذه الخطة؟')) return;
  try{ await deleteDoc(doc(dbFire,'subscriptionPlans',id)); }catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};
SuperAdmin.addDiscountCode = async function(){
  const code = document.getElementById('dc-code').value.trim().toUpperCase();
  const bonusDays = Number(document.getElementById('dc-days').value)||0;
  const maxUsesRaw = document.getElementById('dc-maxuses').value.trim();
  const maxUses = maxUsesRaw ? Number(maxUsesRaw) : null;
  const expiresAt = document.getElementById('dc-expires').value || null;
  if(!code || !bonusDays){ toast('أدخل الكود وعدد الأيام'); return; }
  if(SA_DISCOUNT_CODES.some(c=>c.code===code)){ toast('الكود ده موجود بالفعل'); return; }
  try{
    await fsAddRaw('discountCodes', {code, bonusDays, maxUses, usedCount:0, active:true, expiresAt});
    document.getElementById('dc-code').value=''; document.getElementById('dc-days').value=''; document.getElementById('dc-maxuses').value=''; document.getElementById('dc-expires').value='';
    toast('تم إضافة الكود');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.toggleDiscountCode = async function(id, makeActive){
  try{ await updateDoc(doc(dbFire,'discountCodes',id), {active: makeActive}); }
  catch(e){ console.error(e); toast('تعذر التحديث: '+e.message); }
};
SuperAdmin.removeDiscountCode = async function(id){
  if(!confirm('حذف الكود ده؟')) return;
  try{ await deleteDoc(doc(dbFire,'discountCodes',id)); }catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---- إدارة الأدمن الفرعي: دعوة أدمن فرعي جديد بصلاحيات محددة ---- */
const SUBADMIN_PERM_LABELS = {
  churches: 'إدارة الكنايس (قبول/رفض/تمديد/إعفاء)',
  payments: 'مراجعة وقبول/رفض المدفوعات',
  support: 'الرد على الدردشات والتذاكر',
  settings: 'إدارة طرق الدفع والخطط والروابط',
};
SuperAdmin.renderSubAdmins = function(el){
  el.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">➕ إضافة أدمن فرعي جديد</b>
      <div class="form-grid">
        <div class="field"><label>الاسم بالكامل</label><input id="sub-name"></div>
        <div class="field"><label>رقم الموبايل</label><input id="sub-phone"></div>
        <div class="field"><label>البريد الإلكتروني (هيستخدمه للدخول)</label><input id="sub-email" type="email"></div>
        <div class="field"><label>المسمى الوظيفي</label><input id="sub-title" placeholder="مثال: مشرف دعم"></div>
      </div>
      <div class="field" style="margin-top:6px;"><label>حدّد الصلاحيات المتاحة</label>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:6px;">
          ${Object.entries(SUBADMIN_PERM_LABELS).map(([k,v])=>`
            <label style="display:flex; align-items:center; gap:8px; font-weight:400; font-size:13px;">
              <input type="checkbox" id="sub-perm-${k}"> ${v}
            </label>
          `).join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-sm" style="margin-top:10px;" onclick="SuperAdmin.inviteSubAdmin()">📩 إرسال دعوة تفعيل</button>
      <p class="muted" style="margin-top:6px;">هيوصله رابط دعوة يقدر بيه يحدّد كلمة المرور بنفسه ويفعّل حسابه.</p>
    </div>

    ${SA_SUBADMIN_INVITES.length ? `
      <div class="section-head"><h2>دعوات لسه معلّقة</h2></div>
      <div class="card" style="margin-bottom:16px;">
        ${SA_SUBADMIN_INVITES.map(inv=>`
          <div style="padding:12px 16px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div><b>${esc(inv.name||inv.id)}</b><div class="muted" style="font-size:11.5px;">${esc(inv.id)} · لسه محدّش فعّل الحساب</div></div>
            <button class="btn btn-danger btn-sm" onclick="SuperAdmin.cancelSubAdminInvite('${inv.id}')">إلغاء الدعوة</button>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <div class="section-head"><h2>قائمة الأدمن الفرعي</h2></div>
    <div class="card">
      ${SA_SUBADMINS.length ? SA_SUBADMINS.map(s=>`
        <div style="padding:12px 16px; border-bottom:1px solid var(--line);">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div><b>${esc(s.name)}</b><div class="muted" style="font-size:11.5px;">${esc(s.email)} ${s.jobTitle?' · '+esc(s.jobTitle):''}</div></div>
            <button class="btn btn-danger btn-sm" onclick="SuperAdmin.removeSubAdmin('${s.id}')">حذف الحساب</button>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; margin-top:8px;">
            ${Object.entries(SUBADMIN_PERM_LABELS).map(([k,v])=>`
              <label class="pill ${s.permissions&&s.permissions[k]?'status-active':'status-pending'}" style="cursor:pointer; font-weight:400;">
                <input type="checkbox" ${s.permissions&&s.permissions[k]?'checked':''} onchange="SuperAdmin.toggleSubAdminPerm('${s.id}','${k}',this.checked)" style="margin-left:4px;"> ${v}
              </label>
            `).join('')}
          </div>
        </div>
      `).join('') : `<p class="muted" style="padding:16px;">لا يوجد أدمن فرعي مُفعّل بعد.</p>`}
    </div>
  `;
};
SuperAdmin.inviteSubAdmin = async function(){
  const name = document.getElementById('sub-name').value.trim();
  const phone = document.getElementById('sub-phone').value.trim();
  const email = document.getElementById('sub-email').value.trim().toLowerCase();
  const jobTitle = document.getElementById('sub-title').value.trim();
  const permissions = {};
  Object.keys(SUBADMIN_PERM_LABELS).forEach(k=>{ permissions[k] = document.getElementById('sub-perm-'+k).checked; });
  if(!name || !email){ toast('أدخل الاسم والبريد الإلكتروني'); return; }
  try{
    await setDoc(doc(dbFire,'invites',email), { name, phone, jobTitle, role:'subadmin', churchId:null, permissions, createdAt: Date.now() });
    await saLog('دعوة أدمن فرعي جديد', `${name} — ${email}`);
    toast('تم إرسال الدعوة — هيقدر يدخل من "عندك دعوة؟ انضم هنا" في شاشة الدخول');
    ['sub-name','sub-phone','sub-email','sub-title'].forEach(id=>document.getElementById(id).value='');
    Object.keys(SUBADMIN_PERM_LABELS).forEach(k=>{ document.getElementById('sub-perm-'+k).checked=false; });
  }catch(e){ console.error(e); toast('تعذر إرسال الدعوة: '+e.message); }
};
SuperAdmin.cancelSubAdminInvite = async function(email){
  if(!confirm('إلغاء الدعوة دي؟')) return;
  try{ await deleteDoc(doc(dbFire,'invites',email)); }catch(e){ console.error(e); toast('تعذر الإلغاء: '+e.message); }
};
SuperAdmin.toggleSubAdminPerm = async function(uid, perm, val){
  const s = SA_SUBADMINS.find(x=>x.id===uid);
  const permissions = {...(s?.permissions||{}), [perm]: val};
  try{ await updateDoc(doc(dbFire,'users',uid), {permissions}); }
  catch(e){ console.error(e); toast('تعذر التحديث: '+e.message); }
};
SuperAdmin.removeSubAdmin = async function(uid){
  if(!confirm('حذف حساب الأدمن الفرعي ده؟ لن يقدر يدخل النظام تاني.')) return;
  try{ await deleteDoc(doc(dbFire,'users',uid)); await saLog('حذف أدمن فرعي', uid); toast('تم الحذف'); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---- مركز اتخاذ القرارات: كشف تلقائي لحالات محتاجة قرار + قوالب رسائل + إرسال تنبيه ----
   ملاحظة مهمة: النظام مالوش سيرفر بريد إلكتروني فعلي (مفيش Cloud Functions ولا خدمة إيميل مربوطة)،
   فـ"إرسال التنبيه" بيبعت رسالة فعلية عبر نفس نظام الدردشة الموجود أصلاً بينك وبين الكنيسة (هيوصلها
   إشعار وشارة "غير مقروء" بالظبط زي أي رسالة شات)، بدل ما ندّعي إرسال إيميل حقيقي مش موجود عندنا.
   والحذف دايمًا يدوي بموافقتك — مفيش حذف تلقائي لأي كنيسة مهما طالت مدة عدم الاستخدام. */
const DECISION_TEMPLATE_DEFAULTS = {
  subscriptionEnded: 'سلام ونعمة، اشتراككم في نظام إدارة مدارس الأحد انتهى. برجاء تجديد الاشتراك من شاشة "الاشتراك والدفع" حتى تقدروا تكملوا استخدام النظام بدون انقطاع.',
  trialExpiredNoUpgrade: 'سلام ونعمة، فترة التجربة المجانية بتاعتكم انتهت من فترة ولسه محدّش فعّل اشتراك. لو حابين تكملوا معانا، برجاء تفعيل الاشتراك من شاشة "الاشتراك والدفع".',
  longInactive: 'سلام ونعمة، لاحظنا إن حساب كنيستكم مش مُفعّل من فترة طويلة. لو محتاجين مساعدة أو عندكم استفسار، تواصلوا معانا في أقرب وقت، وإلا هنضطر نراجع استمرارية الحساب.',
};
SuperAdmin.renderDecisions = function(el){
  const t = {...DECISION_TEMPLATE_DEFAULTS, ...SA_DECISION_TEMPLATES};
  const now = Date.now();
  const subscriptionEnded = SA_CHURCHES.filter(c=> c.status==='active' && c.activeUntil && new Date(c.activeUntil).getTime()<=now);
  const trialExpiredLong = SA_CHURCHES.filter(c=> c.status==='trial' && c.trialEndsAt && (now-new Date(c.trialEndsAt).getTime()) > 30*86400000);
  const longInactive = SA_CHURCHES.filter(c=>{
    if(!['expired','rejected'].includes(c.status) && !(c.status==='active' && c.activeUntil && new Date(c.activeUntil).getTime()<=now)) return false;
    const refDate = c.activeUntil || c.trialEndsAt || c.createdAt;
    return refDate && (now - new Date(refDate).getTime()) > 120*86400000;
  });

  const section = (title, list, tplKey, extraBtn)=> `
    <div class="section-head"><h2>${title} <span class="muted" style="font-size:12px;">(${list.length})</span></h2></div>
    <div class="card" style="margin-bottom:20px;">
      ${list.length ? list.map(c=>`
        <div style="padding:12px 16px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <b>${esc(c.name)}</b>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.sendDecisionAlert('${c.id}','${tplKey}')">📩 إرسال تنبيه (عبر الدردشة)</button>
            ${extraBtn ? extraBtn(c) : ''}
          </div>
        </div>
      `).join('') : `<p class="muted" style="padding:16px;">لا توجد كنايس فى هذه الحالة حاليًا.</p>`}
    </div>
  `;

  el.innerHTML = `
    <div class="card card-pad" style="margin-bottom:20px;">
      <b style="font-size:13px; display:block; margin-bottom:10px;">✏️ قوالب الرسائل (تقدر تعدّلها براحتك)</b>
      <div class="field"><label>رسالة "انتهى الاشتراك"</label><textarea id="dt-subscriptionEnded" rows="2">${esc(t.subscriptionEnded)}</textarea></div>
      <div class="field"><label>رسالة "انتهت التجربة ولسه محدّش فعّل"</label><textarea id="dt-trialExpiredNoUpgrade" rows="2">${esc(t.trialExpiredNoUpgrade)}</textarea></div>
      <div class="field"><label>رسالة "غير نشطة من فترة طويلة"</label><textarea id="dt-longInactive" rows="2">${esc(t.longInactive)}</textarea></div>
      <button class="btn btn-primary btn-sm" onclick="SuperAdmin.saveDecisionTemplates()">حفظ القوالب</button>
    </div>

    ${section('⏰ اشتراكات انتهت', subscriptionEnded, 'subscriptionEnded')}
    ${section('🆓 تجربة انتهت من أكتر من شهر بدون تفعيل', trialExpiredLong, 'trialExpiredNoUpgrade')}
    ${section('💤 غير نشطة من أكتر من ٤ شهور (مرشّحة للمراجعة)', longInactive, 'longInactive', c=>`<button class="btn btn-danger btn-sm" onclick="SuperAdmin.deleteChurch('${c.id}','${esc(c.name).replace(/'/g,"\\'")}')">🗑 حذف نهائي (كل بياناتها)</button>`)}
  `;
};
SuperAdmin.saveDecisionTemplates = async function(){
  const data = {
    subscriptionEnded: document.getElementById('dt-subscriptionEnded').value.trim(),
    trialExpiredNoUpgrade: document.getElementById('dt-trialExpiredNoUpgrade').value.trim(),
    longInactive: document.getElementById('dt-longInactive').value.trim(),
  };
  try{ await setDoc(doc(dbFire,'platformConfig','decisionTemplates'), data, {merge:true}); toast('تم حفظ القوالب'); }
  catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.sendDecisionAlert = async function(churchId, tplKey){
  const t = {...DECISION_TEMPLATE_DEFAULTS, ...SA_DECISION_TEMPLATES};
  const text = t[tplKey];
  try{
    await fsAddRaw('chatMessages', { churchId, senderRole:'superadmin', senderName: CURRENT_USER.name, text, createdAt: Date.now(), readBySA:true, readByChurch:false });
    await saLog('إرسال تنبيه (مركز القرارات)', byId(SA_CHURCHES,churchId)?.name||churchId);
    toast('تم إرسال التنبيه عبر الدردشة');
  }catch(e){ console.error(e); toast('تعذر الإرسال: '+e.message); }
};

window.SuperAdmin = SuperAdmin;

/* ---------------- Nav ---------------- */
const NAV_ITEMS = [
  {id:'dashboard', label:'لوحة التحكم', ic:'🏠'},
  {id:'members', label:'المخدومون', ic:'📚'},
  {id:'servants', label:'الخدام', ic:'🧑\u200d🤝\u200d🧑'},
  {id:'stages', label:'المراحل والفصول', ic:'🏫'},
  {id:'attendance', label:'الحضور والغياب', ic:'📅'},
  {id:'evaluations', label:'التقييمات', ic:'⭐'},
  {id:'followups', label:'المتابعة', ic:'📝'},
  {id:'activities', label:'الأنشطة', ic:'🎉'},
  {id:'reports', label:'التقارير', ic:'📊'},
  {id:'billing', label:'الاشتراك والدفع', ic:'💳'},
  {id:'chat', label:'الدردشة مع الإدارة', ic:'💬', adminOnly:true, badge:true},
  {id:'tickets', label:'الدعم الفني والشكاوى', ic:'🎫', adminOnly:true, badge:true},
  {id:'users', label:'المستخدمون والصلاحيات', ic:'👥', adminOnly:true},
  {id:'settings', label:'الإعدادات', ic:'⚙️', adminOnly:true},
  {id:'backup', label:'النسخ الاحتياطي', ic:'💾', adminOnly:true},
];
let IMPERSONATING = false; // true لما المالك يدخل مؤقتًا للوحة كنيسة معينة
function buildNav(){
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV_ITEMS
    .filter(it=> !it.adminOnly || (CURRENT_USER && (CURRENT_USER.role==='admin' || IMPERSONATING)))
    .map(it=>`<li><a class="nav-a" data-page="${it.id}" onclick="App.navigate('${it.id}')"><span class="ic">${it.ic}</span>${it.label}${it.badge?` <span class="badge-count" id="nav-badge-${it.id}" style="display:none;">0</span>`:''}</a></li>`).join('');
}
/* تحديث عدد رسائل غير مقروءة (أو أي عدّاد) جنب عنصر في القائمة الجانبية للكنيسة */
App.updateNavBadge = function(id, count){
  const el = document.getElementById('nav-badge-'+id);
  if(!el) return;
  el.textContent = count;
  el.style.display = count>0 ? 'inline-block' : 'none';
};
App.navigate = function(page, param){
  stopScannerIfActive();
  CURRENT_PAGE = page; CURRENT_PARAM = param;
  UI.closeSidebar();
  document.querySelectorAll('#nav a').forEach(a=>a.classList.toggle('active', a.dataset.page===page));
  const item = NAV_ITEMS.find(i=>i.id===page);
  document.getElementById('page-title').textContent = item?item.label:'';
  const map = {
    dashboard: Views.dashboard, members: Views.members, servants: Views.servants,
    stages: Views.stages, attendance: Views.attendance, evaluations: Views.evaluations,
    followups: Views.followups, activities: Views.activities, reports: Views.reports,
    users: Views.users, settings: Views.settings, backup: Views.backup,
    memberProfile: Views.memberProfile, billing: Views.billing, chat: Views.chat, tickets: Views.tickets,
  };
  (map[page]||Views.dashboard)(param);
};

/* ---------------- Modal helpers ---------------- */
const UI = {};
UI.openModal = function(title, bodyHtml, footHtml){
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-foot').innerHTML = footHtml || '';
  document.getElementById('modal-backdrop').classList.add('open');
};
UI.closeModal = function(){
  document.getElementById('modal-backdrop').classList.remove('open');
  // إغلاق كاميرا الباركود تلقائيًا لو كانت شغالة، لتجنب استهلاك البطارية/سخونة الجهاز فى الخلفية
  if(window.Scanner && Scanner._stream){ Scanner._stream.getTracks().forEach(t=>t.stop()); Scanner._stream=null; }
  if(window.Scanner && Scanner._raf){ cancelAnimationFrame(Scanner._raf); Scanner._raf=null; }
};
/* معاينة صورة مكبّرة داخل مودال (تُستخدم لمرفقات طرق الدفع وإثباتات الدفع) */
UI.previewImage = function(src){
  UI.openModal('معاينة الصورة', `<div style="text-align:center;"><img src="${src}" style="max-width:100%; border-radius:10px; border:1px solid var(--line);"></div>`, `<button class="btn btn-ghost btn-block" onclick="UI.closeModal()">إغلاق</button>`);
};

/* قائمة جانبية للموبايل (سحب/إخفاء) */
UI.openSidebar = function(){ document.getElementById('sidebar').classList.add('open'); document.getElementById('sidebar-backdrop').classList.add('open'); };
UI.closeSidebar = function(){ document.getElementById('sidebar').classList.remove('open'); document.getElementById('sidebar-backdrop').classList.remove('open'); };
UI.openSaSidebar = function(){ document.getElementById('sa-sidebar').classList.add('open'); document.getElementById('sa-sidebar-backdrop').classList.add('open'); };
UI.closeSaSidebar = function(){ document.getElementById('sa-sidebar').classList.remove('open'); document.getElementById('sa-sidebar-backdrop').classList.remove('open'); };

function selectOptions(list, selectedId, placeholder){
  let h = placeholder!==false ? `<option value="">${placeholder||'— اختر —'}</option>` : '';
  (list||[]).forEach(o=> h += `<option value="${o.id}" ${o.id===selectedId?'selected':''}>${esc(o.name)}</option>`);
  return h;
}
function statusPill(status){
  return status==='inactive' ? '<span class="pill pill-inactive">غير نشط</span>' : '<span class="pill pill-active">نشط</span>';
}

/* =========================================================
   VIEWS
   ========================================================= */
const Views = {};
const $content = () => document.getElementById('content');

/* ---------- Dashboard ---------- */
Views.dashboard = function(){
  const D = DB;
  const today = todayISO();
  const todaysAtt = D.attendance.filter(a=>a.date===today);
  const presentToday = todaysAtt.filter(a=>a.present).length;
  const absentToday = todaysAtt.filter(a=>!a.present).length;
  const activeMembers = D.members.filter(m=>m.status!=='inactive');
  const avgEval = (()=>{
    if(!D.evaluations.length) return '—';
    const all = D.evaluations.flatMap(e=>Object.values(e.scores||{}));
    if(!all.length) return '—';
    return (all.reduce((a,b)=>a+Number(b||0),0)/all.length).toFixed(1);
  })();
  const newMembersCount = D.members.filter(m=>{
    const c = new Date(m.createdAt||0); const d=new Date(); d.setDate(d.getDate()-30);
    return c>d;
  }).length;
  const needFollowup = computeNeedFollowup();
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate()-30);
  const monthAtt = D.attendance.filter(a=>new Date(a.date)>=monthAgo);
  const monthPresentPct = monthAtt.length ? Math.round(monthAtt.filter(a=>a.present).length/monthAtt.length*100) : 0;

  $content().innerHTML = `
    <div class="stat-grid">
      ${statCard('إجمالي المخدومين', activeMembers.length,'', "App.navigate('members')")}
      ${statCard('إجمالي الخدام', D.servants.filter(s=>s.status!=='inactive').length,'', "App.navigate('servants')")}
      ${statCard('المراحل / الفصول', D.stages.length+' / '+D.classes.length,'', "App.navigate('stages')")}
      ${statCard('حضور اليوم', presentToday,'good', "App.navigate('attendance')")}
      ${statCard('غياب اليوم', absentToday,'bad', "App.navigate('attendance')")}
      ${statCard('متوسط التقييم', avgEval,'accent', "App.navigate('evaluations')")}
      ${statCard('مخدومون جدد (٣٠ يوم)', newMembersCount,'', "App.navigate('members')")}
      ${statCard('بحاجة لمتابعة', needFollowup.length,'bad', "App.navigate('followups')")}
    </div>
    <div class="card card-pad" style="margin-bottom:18px;">
      <div class="section-head"><h2>نسبة الحضور والغياب</h2></div>
      <div class="toolbar no-print" style="margin-bottom:12px;">
        <div class="field" style="margin:0;"><label>الوحدة</label>
          <select id="dash-chart-unit"><option value="month">شهر</option><option value="day">يوم</option><option value="year">سنة</option></select>
        </div>
        <div class="field" style="margin:0;"><label>العدد</label><input type="number" id="dash-chart-count" value="1" min="1" max="24" style="width:80px;"></div>
        <button class="btn btn-ghost btn-sm" onclick="DashboardChart.reset()">إعادة تعيين</button>
        <button class="btn btn-primary btn-sm" onclick="DashboardChart.render()">📊 عرض</button>
      </div>
      <div id="dash-chart-box"></div>
    </div>
    <div class="dash-grid">
      <div class="card card-pad">
        <div class="section-head"><h2>مخدومون بحاجة إلى متابعة</h2></div>
        ${needFollowup.length? `<table><tbody>${needFollowup.slice(0,6).map(m=>`
          <tr><td class="name-cell"><span class="avatar">${initials(m.name)}</span><span class="nm" onclick="App.navigate('memberProfile','${m.id}')">${esc(m.name)}</span></td>
          <td class="muted">${esc(nameOf(D.classes,m.classId))}</td>
          <td><span class="pill pill-absent">${m.reason}</span></td></tr>`).join('')}</tbody></table>`
          : `<p class="muted">لا يوجد حاليًا مخدومون بحاجة لمتابعة عاجلة 🎉</p>`}
      </div>
      <div class="card card-pad">
        <div class="section-head"><h2>آخر العمليات</h2></div>
        ${D.auditLog.length? `<table><tbody>${D.auditLog.slice(0,10).map(l=>`
          <tr><td><b>${esc(l.action)}</b><div class="muted">${esc(l.details)}</div></td>
          <td class="muted" style="white-space:nowrap;">${fmtDate(l.date)}</td></tr>`).join('')}</tbody></table>`
          : `<p class="muted">لا توجد عمليات مسجلة بعد.</p>`}
        <div class="section-head" style="margin-top:22px;"><h2>اختصارات</h2></div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('attendance')">تسجيل الحضور</button>
          <button class="btn btn-ghost btn-sm" onclick="Members.openForm()">إضافة مخدوم</button>
          <button class="btn btn-ghost btn-sm" onclick="App.navigate('reports')">مركز التقارير</button>
          <button class="btn btn-ghost btn-sm" onclick="Servants.openForm()">إضافة خادم</button>
        </div>
      </div>
    </div>
  `;
  DashboardChart.reset();
};
/* ---- رسم بياني نسبة الحضور/الغياب فى لوحة التحكم، بفلترة يوم/شهر/سنة ---- */
const DashboardChart = {};
DashboardChart.buildData = function(unit, count){
  const buckets = [];
  const now = new Date();
  for(let i=count-1; i>=0; i--){
    let start, end, label;
    if(unit==='day'){
      const d = new Date(now); d.setDate(d.getDate()-i);
      start = end = d.toISOString().slice(0,10);
      label = d.toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'});
    } else if(unit==='year'){
      const y = now.getFullYear()-i;
      start = y+'-01-01'; end = y+'-12-31';
      label = String(y);
    } else { // month (افتراضي)
      const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
      start = d.toISOString().slice(0,10);
      const endD = new Date(d.getFullYear(), d.getMonth()+1, 0);
      end = endD.toISOString().slice(0,10);
      label = d.toLocaleDateString('ar-EG',{month:'short', year:'2-digit'});
    }
    const recs = DB.attendance.filter(a=>a.date>=start && a.date<=end);
    const total = recs.length;
    const presentPct = total ? Math.round(recs.filter(a=>a.present).length/total*100) : 0;
    buckets.push({label, presentPct, absentPct: total?100-presentPct:0, total});
  }
  return buckets;
};
DashboardChart.render = function(){
  const box = document.getElementById('dash-chart-box');
  if(!box) return;
  const unit = document.getElementById('dash-chart-unit').value;
  const count = Math.max(1, Math.min(24, Number(document.getElementById('dash-chart-count').value)||1));
  const data = DashboardChart.buildData(unit, count);
  box.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:10px;">
      ${data.map(b=>`
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:3px;">
            <span>${b.label}</span><span class="muted">${b.total? b.presentPct+'% حضور':'لا يوجد سجلات'}</span>
          </div>
          <div style="height:12px; background:var(--absent-bg); border-radius:99px; overflow:hidden; display:flex;">
            <div style="height:100%; width:${b.presentPct}%; background:var(--present);"></div>
          </div>
        </div>
      `).join('')}
    </div>
  `;
};
DashboardChart.reset = function(){
  const unitSel = document.getElementById('dash-chart-unit');
  const countInp = document.getElementById('dash-chart-count');
  if(unitSel) unitSel.value = 'month';
  if(countInp) countInp.value = 1;
  DashboardChart.render();
};
window.DashboardChart = DashboardChart;
function statCard(label,num,cls,onClick){
  return `<div class="stat-card ${cls||''}" ${onClick?`style="cursor:pointer;" onclick="${onClick}"`:''}><div class="stat-label">${label}</div><div class="stat-num">${num}</div></div>`;
}
function initials(name){ return (name||'?').trim().slice(0,1); }
function computeNeedFollowup(){
  // members whose last 4 recorded sessions include >=2 absences, or 3+ consecutive absences
  const result = [];
  DB.members.filter(m=>m.status!=='inactive').forEach(m=>{
    const records = DB.attendance.filter(a=>a.memberId===m.id).sort((a,b)=>new Date(a.date)-new Date(b.date));
    if(!records.length) return;
    const last4 = records.slice(-4);
    const absLast4 = last4.filter(r=>!r.present).length;
    let consec=0, maxConsec=0;
    records.forEach(r=>{ if(!r.present){consec++; maxConsec=Math.max(maxConsec,consec);} else consec=0; });
    if(maxConsec>=3) result.push({...m, reason:'غياب متتالي ('+maxConsec+')'});
    else if(absLast4>=2) result.push({...m, reason:'غياب متكرر'});
  });
  return result;
}

/* ---------- Generic list-page factory ---------- */
function listPage(opts){
  // opts: {title, addLabel, onAdd, columns:[{h,key,render}], rows, filters(html+bind), searchFields}
  let filterHtml = opts.filtersHtml || '';
  $content().innerHTML = `
    <div class="section-head">
      <h2>${opts.title}</h2>
      <div class="toolbar no-print">
        ${filterHtml}
        <input placeholder="بحث..." id="lp-search" oninput="opts_search()" style="min-width:180px;">
        ${filterHtml? `<button class="btn btn-ghost btn-sm" onclick="_lpReset()">إعادة تعيين</button>`:''}
        ${opts.addLabel? `<button class="btn btn-gold btn-sm" onclick="${opts.onAdd}">+ ${opts.addLabel}</button>`:''}
      </div>
    </div>
    <div class="card"><div id="lp-table-wrap"></div></div>
  `;
  window._lpRender = () => renderListTable(opts);
  window.opts_search = () => renderListTable(opts);
  window._lpReset = () => {
    document.querySelectorAll('.section-head .toolbar select, .section-head .toolbar input').forEach(el=>{
      if(el.tagName==='SELECT') el.selectedIndex = 0; else el.value = '';
    });
    renderListTable(opts);
  };
  renderListTable(opts);
}
function renderListTable(opts){
  const q = (document.getElementById('lp-search')?.value||'').trim().toLowerCase();
  let rows = opts.rows();
  if(q){
    rows = rows.filter(r => (opts.searchFields||[]).some(f => String(r[f]||'').toLowerCase().includes(q)));
  }
  const wrap = document.getElementById('lp-table-wrap');
  if(!rows.length){ wrap.innerHTML = `<div class="empty-state"><div class="ic">☐</div>لا توجد بيانات لعرضها</div>`; return; }
  wrap.innerHTML = `<table><thead><tr>${opts.columns.map(c=>`<th>${c.h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r=>`<tr>${opts.columns.map(c=>`<td>${c.render? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

/* ---------- Members ---------- */
const Members = {};
Views.members = function(){
  listPage({
    title:'المخدومون', addLabel:'إضافة مخدوم', onAdd:'Members.openForm()',
    searchFields:['name','code','phone'],
    filtersHtml:`
      <select id="mf-stage" onchange="_lpRender()"><option value="">كل المراحل</option>${DB.stages.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      <select id="mf-grade" onchange="_lpRender()"><option value="">كل الصفوف</option>${DB.grades.map(g=>`<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>
      <select id="mf-class" onchange="_lpRender()"><option value="">كل الفصول</option>${DB.classes.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    `,
    rows: ()=>{
      const stageF = document.getElementById('mf-stage')?.value;
      const gradeF = document.getElementById('mf-grade')?.value;
      const classF = document.getElementById('mf-class')?.value;
      return DB.members.filter(m=> (!stageF||m.stageId===stageF) && (!gradeF||m.gradeId===gradeF) && (!classF||m.classId===classF) );
    },
    columns:[
      {h:'الاسم', render:m=>`<div class="name-cell"><span class="avatar">${m.photo?`<img src="${m.photo}">`:initials(m.name)}</span><span class="nm" onclick="App.navigate('memberProfile','${m.id}')">${esc(m.name)}</span></div>`},
      {h:'الكود', key:'code'},
      {h:'الجنس', key:'gender'},
      {h:'المرحلة', render:m=>esc(nameOf(DB.stages,m.stageId))},
      {h:'الصف', render:m=>esc(nameOf(DB.grades,m.gradeId))},
      {h:'الفصل', render:m=>esc(nameOf(DB.classes,m.classId))},
      {h:'الهاتف', key:'phone'},
      {h:'الحالة', render:m=>statusPill(m.status)},
      {h:'', render:m=>`<div class="row-actions"><button class="btn btn-ghost btn-sm" onclick="Members.openForm('${m.id}')">تعديل</button><button class="btn btn-danger btn-sm" onclick="Members.remove('${m.id}')">حذف</button></div>`},
    ]
  });
};
Members.openForm = function(id){
  const m = id ? byId(DB.members,id) : {};
  UI.openModal(id?'تعديل بيانات مخدوم':'إضافة مخدوم جديد', `
    <div class="form-grid">
      ${photoFieldHtml(m.photo)}
      <div class="field"><label>الاسم بالكامل</label><input id="f-name" value="${esc(m.name||'')}"></div>
      ${codeFieldHtml('f-code', m.code|| 'M-'+(DB.members.length+1).toString().padStart(3,'0'))}
      <div class="field"><label>تاريخ الميلاد</label><input type="date" id="f-birth" value="${m.birthDate||''}"></div>
      <div class="field"><label>الجنس</label><select id="f-gender"><option value="ذكر" ${m.gender==='ذكر'?'selected':''}>ذكر</option><option value="أنثى" ${m.gender==='أنثى'?'selected':''}>أنثى</option></select></div>
      <div class="field"><label>المرحلة</label><select id="f-stage" onchange="Members._refreshGradeOptions()">${selectOptions(DB.stages,m.stageId)}</select></div>
      <div class="field"><label>الصف الدراسي</label><select id="f-grade" onchange="Members._refreshClassOptions()">${selectOptions(gradesOfStage(m.stageId), m.gradeId)}</select></div>
      <div class="field"><label>الفصل</label><select id="f-class">${selectOptions(classesOfGrade(m.gradeId), m.classId)}</select></div>
      <div class="field"><label>الهاتف</label><input id="f-phone" value="${esc(m.phone||'')}"></div>
      <div class="field"><label>البريد الإلكتروني</label><input id="f-email" value="${esc(m.email||'')}"></div>
      <div class="field"><label>اسم ولي الأمر</label><input id="f-guardian" value="${esc(m.guardianName||'')}"></div>
      <div class="field"><label>هاتف ولي الأمر</label><input id="f-guardianphone" value="${esc(m.guardianPhone||'')}"></div>
      <div class="field full"><label>العنوان</label><input id="f-address" value="${esc(m.address||'')}"></div>
      <div class="field"><label>الحالة</label><select id="f-status"><option value="active" ${m.status!=='inactive'?'selected':''}>نشط</option><option value="inactive" ${m.status==='inactive'?'selected':''}>غير نشط</option></select></div>
      <div class="field full"><label>ملاحظات</label><textarea id="f-notes" rows="2">${esc(m.notes||'')}</textarea></div>
    </div>
  `, `<button class="btn btn-primary" onclick="Members.save('${id||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Members._refreshGradeOptions = function(){
  const stageId = document.getElementById('f-stage').value;
  document.getElementById('f-grade').innerHTML = selectOptions(gradesOfStage(stageId), '');
  Members._refreshClassOptions();
};
Members._refreshClassOptions = function(){
  const gradeId = document.getElementById('f-grade').value;
  document.getElementById('f-class').innerHTML = selectOptions(classesOfGrade(gradeId), '');
};
Members.save = async function(id){
  const name = document.getElementById('f-name').value.trim();
  if(!name){ toast('من فضلك أدخل الاسم'); return; }
  const data = {
    name, code:document.getElementById('f-code').value.trim(), birthDate:document.getElementById('f-birth').value,
    photo: document.getElementById('f-photo-data').value,
    gender:document.getElementById('f-gender').value, stageId:document.getElementById('f-stage').value,
    gradeId:document.getElementById('f-grade').value,
    classId:document.getElementById('f-class').value, phone:document.getElementById('f-phone').value.trim(),
    email:document.getElementById('f-email').value.trim(), guardianName:document.getElementById('f-guardian').value.trim(),
    guardianPhone:document.getElementById('f-guardianphone').value.trim(), address:document.getElementById('f-address').value.trim(),
    status:document.getElementById('f-status').value, notes:document.getElementById('f-notes').value.trim(),
  };
  try{
    if(id){ await fsUpdate('members', id, data); await log('تعديل مخدوم', name); }
    else { await fsAdd('members', {...data, createdAt: Date.now()}); await log('إضافة مخدوم', name); }
    UI.closeModal(); toast('تم الحفظ بنجاح');
    App.navigate(CURRENT_PAGE==='memberProfile'?'members':CURRENT_PAGE);
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Members.remove = async function(id){
  const m = byId(DB.members,id);
  if(!confirm(`هل أنت متأكد من حذف "${m.name}"؟ سيتم حذف كل سجلاته من حضور وتقييمات ومتابعة.`)) return;
  try{
    await Promise.all([
      fsDelete('members', id),
      fsDeleteWhere('attendance','memberId',id),
      fsDeleteWhere('evaluations','memberId',id),
      fsDeleteWhere('followups','memberId',id),
    ]);
    await log('حذف مخدوم', m.name);
    App.navigate('members'); toast('تم الحذف');
  }catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---------- Member profile (الملف الشامل) ---------- */
Views.memberProfile = function(id){
  const m = byId(DB.members,id);
  if(!m){ App.navigate('members'); return; }
  const records = DB.attendance.filter(a=>a.memberId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const present = records.filter(r=>r.present).length;
  const total = records.length;
  const pct = total? Math.round(present/total*100) : 0;
  const evals = DB.evaluations.filter(e=>e.memberId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const avg = evals.length ? (evals.flatMap(e=>Object.values(e.scores||{})).reduce((a,b)=>a+Number(b),0) / evals.flatMap(e=>Object.values(e.scores||{})).length).toFixed(1) : '—';
  const fups = DB.followups.filter(f=>f.memberId===id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const acts = DB.activities.filter(a=>(a.participants||[]).includes(id));

  $content().innerHTML = `
    <button class="btn btn-ghost btn-sm no-print" style="margin-bottom:14px;" onclick="App.navigate('members')">→ رجوع للمخدومين</button>
    <div class="card card-pad">
      <div class="profile-head">
        <span class="avatar">${m.photo?`<img src="${m.photo}">`:initials(m.name)}</span>
        <div style="flex:1;">
          <h2>${esc(m.name)} <span style="font-size:13px;color:var(--ink-soft);font-weight:500;">#${esc(m.code)}</span></h2>
          <div class="muted">${esc(nameOf(DB.stages,m.stageId))} — ${esc(nameOf(DB.grades,m.gradeId))} — ${esc(nameOf(DB.classes,m.classId))} · ${esc(m.gender||'')} · السن ${age(m.birthDate)} · ${statusPill(m.status)}</div>
        </div>
        <button class="btn btn-ghost btn-sm no-print" onclick="Members.openForm('${m.id}')">تعديل البيانات</button>
      </div>
      <div class="stat-grid">
        ${statCard('نسبة الحضور', pct+'%','good')}
        ${statCard('إجمالي الحضور', present,'')}
        ${statCard('إجمالي الغياب', total-present,'bad')}
        ${statCard('متوسط التقييم', avg,'accent')}
      </div>
      <div class="tabs no-print">
        ${['overview:نظرة عامة','attendance:الحضور','evaluations:التقييمات','followups:المتابعة','activities:الأنشطة'].map(t=>{
          const [k,l]=t.split(':'); return `<button class="tab-btn ${CURRENT_MEMBER_TAB===k?'active':''}" onclick="Members.setTab('${id}','${k}')">${l}</button>`;
        }).join('')}
      </div>
      <div id="member-tab-content"></div>
    </div>
  `;
  Members.renderTab(m, records, evals, fups, acts);
};
Members.setTab = function(id, tab){ CURRENT_MEMBER_TAB = tab; App.navigate('memberProfile', id); };
Members.renderTab = function(m, records, evals, fups, acts){
  const el = document.getElementById('member-tab-content');
  if(CURRENT_MEMBER_TAB==='overview'){
    el.innerHTML = `<div class="info-card-grid">
      <div><h3>البيانات الشخصية</h3><div class="kv">
        <b>تاريخ الميلاد</b><span>${fmtDate(m.birthDate)}</span>
        <b>النوع</b><span>${esc(m.gender||'—')}</span>
        <b>الهاتف</b><span>${esc(m.phone||'—')}</span>
        <b>البريد</b><span>${esc(m.email||'—')}</span>
        <b>العنوان</b><span>${esc(m.address||'—')}</span>
        <b>ولي الأمر</b><span>${esc(m.guardianName||'—')} — ${esc(m.guardianPhone||'—')}</span>
      </div></div>
      <div><h3>ملاحظات</h3><p class="muted">${esc(m.notes)||'لا توجد ملاحظات.'}</p></div>
    </div>`;
  } else if(CURRENT_MEMBER_TAB==='attendance'){
    el.innerHTML = records.length ? `<table><thead><tr><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>
      ${records.map(r=>`<tr><td>${fmtDate(r.date)}</td><td>${r.present?'<span class="pill pill-present">حاضر</span>':'<span class="pill pill-absent">غائب</span>'}</td></tr>`).join('')}
    </tbody></table>` : `<p class="muted">لا يوجد سجل حضور بعد.</p>`;
  } else if(CURRENT_MEMBER_TAB==='evaluations'){
    el.innerHTML = `<button class="btn btn-gold btn-sm no-print" style="margin-bottom:12px;" onclick="Evaluations.openForm(null,'${m.id}')">+ تقييم جديد</button>` +
      (evals.length ? evals.map(e=>`<div class="card card-pad" style="margin-bottom:10px;">
        <div class="section-head"><h2 style="font-size:14px;">${fmtDate(e.date)}</h2>
          <div class="row-actions"><button class="btn btn-ghost btn-sm" onclick="Evaluations.openForm('${e.id}','${m.id}')">تعديل</button></div>
        </div>
        ${Object.entries(e.scores||{}).map(([k,v])=>`<div class="rating-row"><span>${esc(EVAL_LABELS[k]||k)}</span><b>${v}/5</b></div>`).join('')}
        ${e.notes?`<p class="muted" style="margin-top:8px;">${esc(e.notes)}</p>`:''}
      </div>`).join('') : `<p class="muted">لا توجد تقييمات بعد.</p>`);
  } else if(CURRENT_MEMBER_TAB==='followups'){
    el.innerHTML = `<button class="btn btn-gold btn-sm no-print" style="margin-bottom:12px;" onclick="Followups.openForm(null,'${m.id}')">+ متابعة جديدة</button>` +
      (fups.length ? `<table><thead><tr><th>التاريخ</th><th>الخادم</th><th>النوع</th><th>الموضوع</th><th>الإجراء</th><th></th></tr></thead><tbody>
      ${fups.map(f=>`<tr><td>${fmtDate(f.date)}</td><td>${esc(nameOf(DB.servants,f.servantId))}</td><td>${esc(f.type)}</td><td>${esc(f.subject)}</td><td>${esc(f.action)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="Followups.openForm('${f.id}','${m.id}')">تعديل</button></td></tr>`).join('')}
      </tbody></table>` : `<p class="muted">لا توجد متابعات مسجلة.</p>`);
  } else if(CURRENT_MEMBER_TAB==='activities'){
    el.innerHTML = acts.length ? `<table><thead><tr><th>النشاط</th><th>التاريخ</th><th>المكان</th></tr></thead><tbody>
      ${acts.map(a=>`<tr><td>${esc(a.name)}</td><td>${fmtDate(a.date)}</td><td>${esc(a.place||'—')}</td></tr>`).join('')}
    </tbody></table>` : `<p class="muted">لم يشارك بعد في أي نشاط.</p>`;
  }
};

/* ---------- Servants ---------- */
const Servants = {};
Views.servants = function(){
  listPage({
    title:'الخدام', addLabel:'إضافة خادم', onAdd:'Servants.openForm()',
    searchFields:['name','code','phone'],
    rows: ()=>DB.servants,
    columns:[
      {h:'الاسم', render:s=>`<div class="name-cell"><span class="avatar">${s.photo?`<img src="${s.photo}">`:initials(s.name)}</span><span class="nm" onclick="Servants.viewProfile('${s.id}')">${esc(s.name)}</span></div>`},
      {h:'الكود', key:'code'},
      {h:'الجنس', key:'gender'},
      {h:'المرحلة', render:s=>esc(nameOf(DB.stages,s.stageId))},
      {h:'الصف', render:s=>esc(nameOf(DB.grades,s.gradeId))},
      {h:'الفصل', render:s=>esc(nameOf(DB.classes,s.classId))},
      {h:'الهاتف', key:'phone'},
      {h:'عدد المخدومين', render:s=>DB.members.filter(m=>m.classId===s.classId).length},
      {h:'الحالة', render:s=>statusPill(s.status)},
      {h:'', render:s=>`<div class="row-actions"><button class="btn btn-ghost btn-sm" onclick="Servants.openForm('${s.id}')">تعديل</button><button class="btn btn-danger btn-sm" onclick="Servants.remove('${s.id}')">حذف</button></div>`},
    ]
  });
};
Servants.viewProfile = function(id){
  const s = byId(DB.servants,id);
  const myMembers = DB.members.filter(m=>m.classId===s.classId);
  UI.openModal('ملف الخادم: '+s.name, `
    <div class="kv" style="margin-bottom:14px;">
      <b>الهاتف</b><span>${esc(s.phone||'—')}</span>
      <b>الجنس</b><span>${esc(s.gender||'—')}</span>
      <b>المرحلة/الصف/الفصل</b><span>${esc(nameOf(DB.stages,s.stageId))} — ${esc(nameOf(DB.grades,s.gradeId))} — ${esc(nameOf(DB.classes,s.classId))}</span>
      <b>تاريخ بدء الخدمة</b><span>${fmtDate(s.startDate)}</span>
      <b>الحالة</b><span>${statusPill(s.status)}</span>
    </div>
    <h3 style="font-size:14px;">المخدومون التابعون (${myMembers.length})</h3>
    ${myMembers.length? `<table><tbody>${myMembers.map(m=>`<tr><td>${esc(m.name)}</td><td class="muted">${esc(m.code)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">لا يوجد مخدومون بعد.</p>'}
  `, `<button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>`);
};
Servants.openForm = function(id){
  const s = id ? byId(DB.servants,id) : {};
  UI.openModal(id?'تعديل بيانات خادم':'إضافة خادم جديد', `
    <div class="form-grid">
      ${photoFieldHtml(s.photo)}
      <div class="field"><label>الاسم</label><input id="f-name" value="${esc(s.name||'')}"></div>
      ${codeFieldHtml('f-code', s.code|| 'S-'+(DB.servants.length+1).toString().padStart(3,'0'))}
      <div class="field"><label>الهاتف</label><input id="f-phone" value="${esc(s.phone||'')}"></div>
      <div class="field"><label>تاريخ بدء الخدمة</label><input type="date" id="f-start" value="${s.startDate||''}"></div>
      <div class="field"><label>الجنس</label><select id="f-gender"><option value="ذكر" ${s.gender==='ذكر'?'selected':''}>ذكر</option><option value="أنثى" ${s.gender==='أنثى'?'selected':''}>أنثى</option></select></div>
      <div class="field"><label>المرحلة</label><select id="f-stage" onchange="Servants._refreshGrade()">${selectOptions(DB.stages,s.stageId)}</select></div>
      <div class="field"><label>الصف الدراسي</label><select id="f-grade" onchange="Servants._refreshClass()">${selectOptions(gradesOfStage(s.stageId), s.gradeId)}</select></div>
      <div class="field"><label>الفصل</label><select id="f-class">${selectOptions(classesOfGrade(s.gradeId), s.classId)}</select></div>
      <div class="field"><label>الحالة</label><select id="f-status"><option value="active" ${s.status!=='inactive'?'selected':''}>نشط</option><option value="inactive" ${s.status==='inactive'?'selected':''}>غير نشط</option></select></div>
      <div class="field full"><label>ملاحظات</label><textarea id="f-notes" rows="2">${esc(s.notes||'')}</textarea></div>
    </div>
  `, `<button class="btn btn-primary" onclick="Servants.save('${id||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Servants._refreshGrade = function(){
  const stageId = document.getElementById('f-stage').value;
  document.getElementById('f-grade').innerHTML = selectOptions(gradesOfStage(stageId), '');
  Servants._refreshClass();
};
Servants._refreshClass = function(){
  const gradeId = document.getElementById('f-grade').value;
  document.getElementById('f-class').innerHTML = selectOptions(classesOfGrade(gradeId), '');
};
Servants.save = async function(id){
  const name = document.getElementById('f-name').value.trim();
  if(!name){ toast('من فضلك أدخل الاسم'); return; }
  const data = {
    name, code:document.getElementById('f-code').value.trim(), phone:document.getElementById('f-phone').value.trim(),
    photo: document.getElementById('f-photo-data').value,
    gender:document.getElementById('f-gender').value,
    startDate:document.getElementById('f-start').value, stageId:document.getElementById('f-stage').value,
    gradeId:document.getElementById('f-grade').value,
    classId:document.getElementById('f-class').value, status:document.getElementById('f-status').value,
    notes:document.getElementById('f-notes').value.trim(),
  };
  try{
    if(id){ await fsUpdate('servants', id, data); await log('تعديل خادم', name); }
    else { await fsAdd('servants', data); await log('إضافة خادم', name); }
    UI.closeModal(); toast('تم الحفظ بنجاح'); App.navigate('servants');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Servants.remove = async function(id){
  const s = byId(DB.servants,id);
  if(!confirm(`هل تريد حذف الخادم "${s.name}"؟`)) return;
  try{
    await fsDelete('servants', id);
    await log('حذف خادم', s.name); App.navigate('servants'); toast('تم الحذف');
  }catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---------- Stages > Grades > Classes ---------- */
Views.stages = function(){
  $content().innerHTML = `
    <div class="section-head"><h2>المراحل والصفوف والفصول</h2>
      <div class="toolbar no-print">
        <button class="btn btn-gold btn-sm" onclick="Stages.openStageForm()">+ إضافة مرحلة</button>
        <button class="btn btn-ghost btn-sm" onclick="Stages.openGradeForm()">+ إضافة صف دراسي</button>
        <button class="btn btn-ghost btn-sm" onclick="Stages.openClassForm()">+ إضافة فصل</button>
      </div>
    </div>
    <div class="info-card-grid">
      ${DB.stages.map(st=>{
        const grades = gradesOfStage(st.id);
        const memberCount = DB.members.filter(m=>m.stageId===st.id).length;
        return `<div class="card card-pad">
          <div class="section-head"><h2 style="font-size:15px;">${esc(st.name)} <span class="muted">(${memberCount} مخدوم)</span></h2>
            <div class="row-actions no-print"><button class="btn btn-ghost btn-sm" onclick="Stages.autoFillGrades('${st.id}')">⚡ توليد صفوف تلقائيًا</button><button class="btn btn-ghost btn-sm" onclick="Stages.openStageForm('${st.id}')">تعديل</button><button class="btn btn-danger btn-sm" onclick="Stages.removeStage('${st.id}')">حذف</button></div>
          </div>
          ${grades.length? grades.map(g=>{
            const classes = classesOfGrade(g.id);
            const gMemberCount = DB.members.filter(m=>m.gradeId===g.id).length;
            return `<div style="border-top:1px dashed var(--line); padding:10px 0;">
              <div class="rating-row" style="border:none; padding:0 0 6px;">
                <b>${esc(g.name)}</b>
                <span class="row-actions"><span class="muted">${gMemberCount} مخدوم</span>
                <button class="btn btn-ghost btn-sm no-print" onclick="Stages.openGradeForm('${g.id}')">تعديل</button>
                <button class="btn btn-danger btn-sm no-print" onclick="Stages.removeGrade('${g.id}')">حذف</button></span>
              </div>
              ${classes.length? classes.map(c=>`<div class="rating-row" style="padding-right:14px;"><span class="muted">↳ ${esc(c.name)}</span>
                <span class="row-actions"><span class="muted">${DB.members.filter(m=>m.classId===c.id).length} مخدوم</span>
                <button class="btn btn-ghost btn-sm no-print" onclick="Stages.openClassForm('${c.id}')">تعديل</button>
                <button class="btn btn-danger btn-sm no-print" onclick="Stages.removeClass('${c.id}')">حذف</button></span></div>`).join('')
                : `<p class="muted" style="padding-right:14px;">لا توجد فصول بهذا الصف بعد.</p>`}
            </div>`;
          }).join('') : `<p class="muted">لا توجد صفوف دراسية بهذه المرحلة بعد.</p>`}
        </div>`;
      }).join('')}
    </div>
  `;
};
const Stages = {};
Stages.openStageForm = function(id){
  const s = id?byId(DB.stages,id):{};
  UI.openModal(id?'تعديل مرحلة':'إضافة مرحلة', `<div class="field"><label>اسم المرحلة</label><input id="f-name" value="${esc(s.name||'')}"></div>`,
    `<button class="btn btn-primary" onclick="Stages.saveStage('${id||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Stages.saveStage = async function(id){
  const name = document.getElementById('f-name').value.trim(); if(!name) return toast('أدخل اسم المرحلة');
  try{
    if(id){ await fsUpdate('stages', id, {name}); await log('تعديل مرحلة',name); }
    else { await fsAdd('stages', {name}); await log('إضافة مرحلة',name); }
    UI.closeModal(); App.navigate('stages'); toast('تم الحفظ');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Stages.removeStage = async function(id){
  if(!confirm('حذف المرحلة سيحذف كل الصفوف والفصول المرتبطة بها. متابعة؟')) return;
  try{
    const gradeIds = gradesOfStage(id).map(g=>g.id);
    await Promise.all(gradeIds.map(gid=>fsDeleteWhere('classes','gradeId',gid)));
    await fsDeleteWhere('grades','stageId',id);
    await fsDelete('stages', id);
    await log('حذف مرحلة', id); App.navigate('stages');
  }catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};
Stages.openGradeForm = function(id){
  const g = id?byId(DB.grades,id):{};
  UI.openModal(id?'تعديل صف دراسي':'إضافة صف دراسي', `
    <div class="field"><label>اسم الصف الدراسي</label><input id="f-name" value="${esc(g.name||'')}" placeholder="مثال: الأول الإعدادي"></div>
    <div class="field"><label>المرحلة</label><select id="f-stage">${selectOptions(DB.stages,g.stageId)}</select></div>
  `, `<button class="btn btn-primary" onclick="Stages.saveGrade('${id||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Stages.saveGrade = async function(id){
  const name = document.getElementById('f-name').value.trim(); if(!name) return toast('أدخل اسم الصف الدراسي');
  const stageId = document.getElementById('f-stage').value; if(!stageId) return toast('اختر المرحلة');
  try{
    if(id){ await fsUpdate('grades', id, {name,stageId}); await log('تعديل صف دراسي',name); }
    else { await fsAdd('grades', {name,stageId,order:gradesOfStage(stageId).length}); await log('إضافة صف دراسي',name); }
    UI.closeModal(); App.navigate('stages'); toast('تم الحفظ');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Stages.removeGrade = async function(id){
  if(!confirm('حذف الصف الدراسي سيحذف الفصول المرتبطة به. متابعة؟')) return;
  try{
    await fsDeleteWhere('classes','gradeId',id);
    await fsDelete('grades', id);
    await log('حذف صف دراسي', id); App.navigate('stages');
  }catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};
Stages.openClassForm = function(id){
  const c = id?byId(DB.classes,id):{};
  const stageId = c.gradeId ? stageOfClass(c.id) : (DB.stages[0]&&DB.stages[0].id);
  UI.openModal(id?'تعديل فصل':'إضافة فصل', `
    <div class="field"><label>اسم الفصل</label><input id="f-name" value="${esc(c.name||'')}" placeholder="مثال: فصل أ"></div>
    <div class="field"><label>المرحلة</label><select id="f-stage" onchange="Stages._refreshGradeOpt()">${selectOptions(DB.stages,stageId)}</select></div>
    <div class="field"><label>الصف الدراسي</label><select id="f-grade">${selectOptions(gradesOfStage(stageId), c.gradeId)}</select></div>
  `, `<button class="btn btn-primary" onclick="Stages.saveClass('${id||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Stages._refreshGradeOpt = function(){
  const stageId = document.getElementById('f-stage').value;
  document.getElementById('f-grade').innerHTML = selectOptions(gradesOfStage(stageId), '');
};
Stages.saveClass = async function(id){
  const name = document.getElementById('f-name').value.trim(); if(!name) return toast('أدخل اسم الفصل');
  const gradeId = document.getElementById('f-grade').value; if(!gradeId) return toast('اختر الصف الدراسي');
  try{
    if(id){ await fsUpdate('classes', id, {name,gradeId}); await log('تعديل فصل',name); }
    else { await fsAdd('classes', {name,gradeId}); await log('إضافة فصل',name); }
    UI.closeModal(); App.navigate('stages'); toast('تم الحفظ');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Stages.removeClass = async function(id){
  if(!confirm('حذف الفصل؟')) return;
  try{ await fsDelete('classes', id); await log('حذف فصل', id); App.navigate('stages'); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};
/* قوالب أسماء صفوف دراسية شائعة، تُقترح تلقائيًا حسب اسم المرحلة (بند: ربط تسلسل المراحل بالصفوف) */
const STAGE_GRADE_TEMPLATES = [
  {match:/حضان|روض|تمهيد/, grades:['تمهيدي أول','تمهيدي ثاني']},
  {match:/ابتدائ/, grades:['أولى ابتدائي','تانية ابتدائي','تالتة ابتدائي','رابعة ابتدائي','خامسة ابتدائي','سادسة ابتدائي']},
  {match:/اعداد|إعداد/, grades:['أولى إعدادي','تانية إعدادي','تالتة إعدادي']},
  {match:/ثانو/, grades:['أولى ثانوي','تانية ثانوي','تالتة ثانوي']},
];
Stages.autoFillGrades = async function(stageId){
  const st = byId(DB.stages, stageId);
  if(!st) return;
  const tpl = STAGE_GRADE_TEMPLATES.find(t=>t.match.test(st.name));
  if(!tpl){ toast('مفيش قالب صفوف جاهز لاسم المرحلة ده — أضف الصفوف يدويًا من "+ إضافة صف دراسي"'); return; }
  const existingNames = gradesOfStage(stageId).map(g=>g.name);
  const toAdd = tpl.grades.filter(g=>!existingNames.includes(g));
  if(!toAdd.length){ toast('كل الصفوف الافتراضية لهذه المرحلة مضافة بالفعل'); return; }
  if(!confirm(`هيتم إضافة ${toAdd.length} صف دراسي تلقائيًا:\n${toAdd.join('، ')}\nمتابعة؟`)) return;
  try{
    const batch = writeBatch(dbFire);
    toAdd.forEach((name,i)=>{
      const ref = doc(collection(dbFire,'grades'));
      batch.set(ref, {name, stageId, churchId:CURRENT_CHURCH_ID, order: existingNames.length+i});
    });
    await batch.commit();
    await log('توليد صفوف تلقائي', st.name);
    App.navigate('stages'); toast('تم توليد الصفوف بنجاح');
  }catch(e){ console.error(e); toast('تعذر التوليد: '+e.message); }
};

/* ---------- Attendance ---------- */
Views.attendance = function(){
  const stageOpts = selectOptions(DB.stages,'', 'كل المراحل');
  $content().innerHTML = `
    <div class="section-head"><h2>تسجيل الحضور والغياب</h2></div>
    <div class="card card-pad no-print" style="margin-bottom:16px; display:flex; gap:8px; align-items:flex-end; flex-wrap:wrap;">
      <div class="field" style="margin:0; flex:1; min-width:220px;"><label>تسجيل حضور سريع بالكود / الباركود</label>
        <input id="att-scan-input" placeholder="امسح الكود أو اكتبه واضغط Enter" onkeydown="if(event.key==='Enter'){Attendance.scanCode(this.value); this.value='';}">
      </div>
      <button type="button" class="btn btn-gold btn-sm" onclick="Scanner.open(v=>{const inp=document.getElementById('att-scan-input'); if(inp) inp.value=v; Attendance.scanCode(v);})">📷 قراءة بالكاميرا</button>
    </div>
    <div class="card card-pad no-print" style="margin-bottom:16px;">
      <div class="toolbar">
        <div class="field" style="margin:0;"><label>التاريخ</label><input type="date" id="att-date" value="${todayISO()}" onchange="Attendance.render()"></div>
        <div class="field" style="margin:0;"><label>المرحلة</label><select id="att-stage" onchange="Attendance.onStageChange()">${stageOpts}</select></div>
        <div class="field" style="margin:0;"><label>الصف الدراسي</label><select id="att-grade" onchange="Attendance.onGradeChange()"><option value="">اختر صفًا</option></select></div>
        <div class="field" style="margin:0;"><label>الفصل</label><select id="att-class" onchange="Attendance.render()"><option value="">اختر فصلًا</option></select></div>
      </div>
    </div>
    <div id="att-body"></div>
  `;
  Attendance.onStageChange();
};
const Attendance = {};
Attendance.onStageChange = function(){
  const stageId = document.getElementById('att-stage').value;
  const grades = gradesOfStage(stageId);
  document.getElementById('att-grade').innerHTML = '<option value="">اختر صفًا</option>' + selectOptions(grades,'',false);
  document.getElementById('att-class').innerHTML = '<option value="">اختر فصلًا</option>';
  document.getElementById('att-body').innerHTML = '';
};
Attendance.onGradeChange = function(){
  const gradeId = document.getElementById('att-grade').value;
  const classes = classesOfGrade(gradeId);
  document.getElementById('att-class').innerHTML = '<option value="">اختر فصلًا</option>' + selectOptions(classes,'',false);
  document.getElementById('att-body').innerHTML = '';
};
Attendance.render = function(){
  const classId = document.getElementById('att-class').value;
  const date = document.getElementById('att-date').value;
  const body = document.getElementById('att-body');
  if(!classId){ body.innerHTML=''; return; }
  const members = DB.members.filter(m=>m.classId===classId && m.status!=='inactive');
  if(!members.length){ body.innerHTML = `<div class="card"><div class="empty-state">لا يوجد مخدومون في هذا الفصل</div></div>`; return; }
  body.innerHTML = `
    <div class="card">
      <div class="section-head card-pad" style="margin-bottom:0;">
        <h2 style="font-size:14px;">${fmtDate(date)} — ${esc(nameOf(DB.classes,classId))} (${members.length} مخدوم)</h2>
        <div class="toolbar no-print">
          <button class="btn btn-ghost btn-sm" onclick="Attendance.markAll(true)">تحديد الكل حاضر</button>
          <button class="btn btn-primary btn-sm" onclick="Attendance.saveAll()">حفظ الحضور</button>
        </div>
      </div>
      <table><thead><tr><th>الاسم</th><th>الكود</th><th>الحالة</th></tr></thead>
      <tbody id="att-rows">
        ${members.map(m=>{
          const rec = DB.attendance.find(a=>a.date===date && a.memberId===m.id && a.classId===classId);
          const present = rec? rec.present : true;
          return `<tr data-mid="${m.id}"><td>${esc(m.name)}</td><td class="muted">${esc(m.code)}</td>
          <td><label style="margin-left:14px;"><input type="radio" name="p-${m.id}" value="1" ${present?'checked':''}> حاضر</label>
          <label><input type="radio" name="p-${m.id}" value="0" ${!present?'checked':''}> غائب</label></td></tr>`;
        }).join('')}
      </tbody></table>
    </div>
  `;
};
Attendance.scanCode = async function(code){
  const val = (code||'').trim();
  if(!val) return;
  const member = DB.members.find(m=> (m.code||'').trim()===val);
  if(!member){ toast('مفيش مخدوم بالكود ده: '+val); return; }
  if(!member.classId){ toast(member.name+' مش متسجّل في فصل بعد'); return; }
  const date = document.getElementById('att-date') ? document.getElementById('att-date').value : todayISO();
  try{
    const rec = DB.attendance.find(a=>a.date===date && a.memberId===member.id && a.classId===member.classId);
    if(rec) await fsUpdate('attendance', rec.id, {present:true});
    else await fsAdd('attendance', {date, classId:member.classId, memberId:member.id, present:true});
    toast('✅ تم تسجيل حضور: '+member.name);
    await log('تسجيل حضور بالباركود', member.name);
    // لو المستخدم واقف على نفس فصل المخدوم، حدّث القائمة الظاهرة على طول
    const stageSel=document.getElementById('att-stage'), gradeSel=document.getElementById('att-grade'), classSel=document.getElementById('att-class');
    if(classSel && classSel.value===member.classId){ Attendance.render(); }
    else if(stageSel && classSel && !classSel.value){
      // فضّل نساعد المستخدم بعرض فصل المخدوم مباشرة
      stageSel.value = member.stageId||''; Attendance.onStageChange();
      gradeSel.value = member.gradeId||''; Attendance.onGradeChange();
      classSel.value = member.classId||''; Attendance.render();
    }
  }catch(e){ console.error(e); toast('تعذر تسجيل الحضور: '+e.message); }
};
Attendance.markAll = function(present){
  document.querySelectorAll('#att-rows tr').forEach(tr=>{
    const mid = tr.dataset.mid;
    tr.querySelector(`input[name="p-${mid}"][value="${present?1:0}"]`).checked = true;
  });
};
Attendance.saveAll = async function(){
  const classId = document.getElementById('att-class').value;
  const date = document.getElementById('att-date').value;
  const ops = [];
  document.querySelectorAll('#att-rows tr').forEach(tr=>{
    const mid = tr.dataset.mid;
    const present = tr.querySelector(`input[name="p-${mid}"]:checked`).value === '1';
    const rec = DB.attendance.find(a=>a.date===date && a.memberId===mid && a.classId===classId);
    if(rec) ops.push(fsUpdate('attendance', rec.id, {present}));
    else ops.push(fsAdd('attendance', {date, classId, memberId:mid, present}));
  });
  try{
    await Promise.all(ops);
    await log('تسجيل حضور', fmtDate(date)+' — '+nameOf(DB.classes,classId));
    toast('تم حفظ الحضور بنجاح');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};

/* ---------- Evaluations ---------- */
const EVAL_LABELS = {
  reg:'الانتظام', part:'المشاركة', prayer:'الصلاة', bible:'معرفة الكتاب المقدس',
  behavior:'التعامل مع الآخرين', commit:'الالتزام', coop:'التعاون',
  lesson:'استيعاب الدرس', partAcademic:'المشاركة الدراسية', verses:'حفظ الآيات',
};
const EVAL_GROUPS = {
  'روحيًا':['reg','part','prayer','bible'],
  'سلوكيًا':['behavior','commit','coop'],
  'دراسيًا':['lesson','partAcademic','verses'],
};
const Evaluations = {};
Views.evaluations = function(){
  listPage({
    title:'التقييمات', addLabel:'تقييم جديد', onAdd:'Evaluations.openForm()',
    searchFields:[],
    rows:()=>DB.evaluations.map(e=>({...e, memberName:nameOf(DB.members,e.memberId), avg:(Object.values(e.scores||{}).reduce((a,b)=>a+Number(b),0)/(Object.values(e.scores||{}).length||1)).toFixed(1)})).sort((a,b)=>new Date(b.date)-new Date(a.date)),
    columns:[
      {h:'المخدوم', key:'memberName'},
      {h:'التاريخ', render:e=>fmtDate(e.date)},
      {h:'المتوسط', render:e=>`<b>${e.avg}</b> / 5`},
      {h:'', render:e=>`<div class="row-actions"><button class="btn btn-ghost btn-sm" onclick="Evaluations.openForm('${e.id}','${e.memberId}')">تعديل</button><button class="btn btn-danger btn-sm" onclick="Evaluations.remove('${e.id}')">حذف</button></div>`},
    ]
  });
};
Evaluations.openForm = function(id, memberId){
  const e = id ? byId(DB.evaluations,id) : {scores:{}};
  UI.openModal(id?'تعديل تقييم':'تقييم جديد', `
    <div class="form-grid">
      ${memberId? `<div class="field"><label>المخدوم</label><input value="${esc(nameOf(DB.members,memberId))}" disabled></div>` : memberPickerHtml('f-member', e.memberId)}
      <div class="field"><label>التاريخ</label><input type="date" id="f-date" value="${e.date||todayISO()}"></div>
    </div>
    ${Object.entries(EVAL_GROUPS).map(([g,keys])=>`
      <h3 style="font-size:14px;margin:16px 0 6px;">${g}</h3>
      ${keys.map(k=>`<div class="rating-row"><span>${EVAL_LABELS[k]}</span><div class="stars" data-key="${k}">${[1,2,3,4,5].map(n=>`<span data-n="${n}" class="${(e.scores&&e.scores[k]>=n)?'on':''}" onclick="Evaluations.setStar('${k}',${n})">★</span>`).join('')}</div></div>`).join('')}
    `).join('')}
    <div class="field full" style="margin-top:14px;"><label>ملاحظات</label><textarea id="f-notes" rows="2">${esc(e.notes||'')}</textarea></div>
  `, `<button class="btn btn-primary" onclick="Evaluations.save('${id||''}','${memberId||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
  window._evalScores = {...(e.scores||{})};
};
Evaluations.setStar = function(key,n){
  window._evalScores[key] = n;
  const wrap = document.querySelector(`.stars[data-key="${key}"]`);
  wrap.querySelectorAll('span').forEach(s=> s.classList.toggle('on', Number(s.dataset.n)<=n));
};
Evaluations.save = async function(id, fixedMemberId){
  const memberId = fixedMemberId || document.getElementById('f-member').value;
  if(!memberId) return toast('اختر المخدوم');
  const data = { memberId, date:document.getElementById('f-date').value, scores:{...window._evalScores}, notes:document.getElementById('f-notes').value.trim() };
  try{
    if(id){ await fsUpdate('evaluations', id, data); await log('تعديل تقييم', nameOf(DB.members,memberId)); }
    else { await fsAdd('evaluations', data); await log('إضافة تقييم', nameOf(DB.members,memberId)); }
    UI.closeModal(); toast('تم الحفظ بنجاح');
    App.navigate(fixedMemberId? 'memberProfile':'evaluations', fixedMemberId||undefined);
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Evaluations.remove = async function(id){
  if(!confirm('حذف هذا التقييم؟')) return;
  try{ await fsDelete('evaluations', id); App.navigate('evaluations'); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---------- Follow-ups ---------- */
const Followups = {};
Views.followups = function(){
  listPage({
    title:'المتابعة الفردية', addLabel:'متابعة جديدة', onAdd:'Followups.openForm()',
    searchFields:[],
    rows:()=>DB.followups.map(f=>({...f, memberName:nameOf(DB.members,f.memberId), servantName:nameOf(DB.servants,f.servantId)})).sort((a,b)=>new Date(b.date)-new Date(a.date)),
    columns:[
      {h:'المخدوم', key:'memberName'}, {h:'التاريخ', render:f=>fmtDate(f.date)}, {h:'الخادم', key:'servantName'},
      {h:'النوع', key:'type'}, {h:'الموضوع', key:'subject'},
      {h:'', render:f=>`<div class="row-actions"><button class="btn btn-ghost btn-sm" onclick="Followups.openForm('${f.id}','${f.memberId}')">تعديل</button><button class="btn btn-danger btn-sm" onclick="Followups.remove('${f.id}')">حذف</button></div>`},
    ]
  });
};
Followups.openForm = function(id, memberId){
  const f = id ? byId(DB.followups,id) : {};
  const followupTypeOptions = [...new Set(['غياب','سلوكي','روحي','دراسي','أسري','أخرى', ...(DB.settings.followupTypes||[])])];
  UI.openModal(id?'تعديل متابعة':'متابعة جديدة', `
    <div class="form-grid">
      ${memberId? `<div class="field"><label>المخدوم</label><input value="${esc(nameOf(DB.members,memberId))}" disabled></div>` : memberPickerHtml('f-member', f.memberId)}
      <div class="field"><label>التاريخ</label><input type="date" id="f-date" value="${f.date||todayISO()}"></div>
      <div class="field"><label>الخادم المسؤول</label><select id="f-servant">${selectOptions(DB.servants,f.servantId)}</select></div>
      <div class="field"><label>نوع المتابعة</label><select id="f-type">
        ${followupTypeOptions.map(t=>`<option ${f.type===t?'selected':''}>${esc(t)}</option>`).join('')}
      </select></div>
      <div class="field full"><label>موضوع المتابعة</label><input id="f-subject" value="${esc(f.subject||'')}"></div>
      <div class="field full"><label>الملاحظات</label><textarea id="f-notes" rows="2">${esc(f.notes||'')}</textarea></div>
      <div class="field full"><label>الإجراء الذي تم اتخاذه</label><textarea id="f-action" rows="2">${esc(f.action||'')}</textarea></div>
      <div class="field"><label>موعد المتابعة القادمة (اختياري)</label><input type="date" id="f-next" value="${f.nextDate||''}"></div>
    </div>
  `, `<button class="btn btn-primary" onclick="Followups.save('${id||''}','${memberId||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Followups.save = async function(id, fixedMemberId){
  const memberId = fixedMemberId || document.getElementById('f-member').value;
  if(!memberId) return toast('اختر المخدوم');
  const data = {
    memberId, date:document.getElementById('f-date').value, servantId:document.getElementById('f-servant').value,
    type:document.getElementById('f-type').value, subject:document.getElementById('f-subject').value.trim(),
    notes:document.getElementById('f-notes').value.trim(), action:document.getElementById('f-action').value.trim(),
    nextDate:document.getElementById('f-next').value,
  };
  try{
    if(id){ await fsUpdate('followups', id, data); await log('تعديل متابعة', nameOf(DB.members,memberId)); }
    else { await fsAdd('followups', data); await log('إضافة متابعة', nameOf(DB.members,memberId)); }
    UI.closeModal(); toast('تم الحفظ بنجاح');
    App.navigate(fixedMemberId?'memberProfile':'followups', fixedMemberId||undefined);
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Followups.remove = async function(id){
  if(!confirm('حذف سجل المتابعة؟')) return;
  try{ await fsDelete('followups', id); App.navigate('followups'); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---------- Activities ---------- */
const Activities = {};
Views.activities = function(){
  listPage({
    title:'الأنشطة', addLabel:'إضافة نشاط', onAdd:'Activities.openForm()',
    searchFields:['name','place','responsible'],
    rows:()=>[...DB.activities].sort((a,b)=>new Date(b.date)-new Date(a.date)),
    columns:[
      {h:'النشاط', key:'name'}, {h:'التاريخ', render:a=>fmtDate(a.date)}, {h:'المكان', key:'place'},
      {h:'المسؤول', key:'responsible'}, {h:'عدد المشاركين', render:a=>(a.participants||[]).length},
      {h:'', render:a=>`<div class="row-actions"><button class="btn btn-ghost btn-sm" onclick="Activities.openForm('${a.id}')">تعديل</button><button class="btn btn-danger btn-sm" onclick="Activities.remove('${a.id}')">حذف</button></div>`},
    ]
  });
};
Activities.openForm = function(id){
  const a = id?byId(DB.activities,id):{participants:[]};
  UI.openModal(id?'تعديل نشاط':'إضافة نشاط', `
    <div class="form-grid">
      <div class="field"><label>اسم النشاط</label>
        <input id="f-name" list="activity-names-dl" value="${esc(a.name||'')}" placeholder="اكتب اسم النشاط أو اختر من المقترحات">
        <datalist id="activity-names-dl">${(DB.settings.activityNames||[]).map(v=>`<option value="${esc(v)}">`).join('')}</datalist>
      </div>
      <div class="field"><label>التاريخ</label><input type="date" id="f-date" value="${a.date||todayISO()}"></div>
      <div class="field"><label>المكان</label><input id="f-place" value="${esc(a.place||'')}"></div>
      <div class="field"><label>المسؤول</label><select id="f-resp">
        <option value="">اختر خادمًا مسؤولًا</option>
        ${DB.servants.map(s=>`<option value="${esc(s.name)}" ${a.responsible===s.name?'selected':''}>${esc(s.name)}</option>`).join('')}
      </select></div>
      <div class="field full"><label>ملاحظات</label><textarea id="f-notes" rows="2">${esc(a.notes||'')}</textarea></div>
      <div class="field full"><label>المشاركون</label>
        <div class="toolbar" style="margin-bottom:8px;">
          <select id="pt-stage" onchange="Activities.filterParticipants()" style="min-width:120px;">${selectOptions(DB.stages,'','كل المراحل')}</select>
          <input id="pt-search" placeholder="بحث بالاسم أو الكود..." oninput="Activities.filterParticipants()" style="flex:1; min-width:140px;">
          <button type="button" class="btn btn-ghost btn-sm" onclick="Scanner.open(v=>Activities.checkByCode(v))">📷</button>
        </div>
        <div class="checklist" id="participants-checklist">${DB.members.map(m=>`<label data-name="${esc(m.name).toLowerCase()}" data-code="${esc(m.code||'').toLowerCase()}" data-stage="${m.stageId||''}"><input type="checkbox" value="${m.id}" ${(a.participants||[]).includes(m.id)?'checked':''} class="f-part"> ${esc(m.name)}</label>`).join('')}</div>
      </div>
    </div>
  `, `<button class="btn btn-primary" onclick="Activities.save('${id||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Activities.filterParticipants = function(){
  const q = document.getElementById('pt-search').value.trim().toLowerCase();
  const stageId = document.getElementById('pt-stage').value;
  document.querySelectorAll('#participants-checklist label').forEach(lb=>{
    const matchQ = !q || lb.dataset.name.includes(q) || lb.dataset.code.includes(q);
    const matchStage = !stageId || lb.dataset.stage===stageId;
    lb.style.display = (matchQ && matchStage) ? '' : 'none';
  });
};
Activities.checkByCode = function(code){
  const target = Array.from(document.querySelectorAll('#participants-checklist label')).find(lb=>lb.dataset.code===code.trim().toLowerCase());
  if(!target){ toast('مفيش مخدوم بالكود ده: '+code); return; }
  target.querySelector('input.f-part').checked = true;
  target.style.display = '';
  target.scrollIntoView({block:'center'});
};
Activities.save = async function(id){
  const name = document.getElementById('f-name').value.trim(); if(!name) return toast('أدخل اسم النشاط');
  const participants = Array.from(document.querySelectorAll('.f-part:checked')).map(c=>c.value);
  const data = { name, date:document.getElementById('f-date').value, place:document.getElementById('f-place').value.trim(),
    responsible:document.getElementById('f-resp').value.trim(), notes:document.getElementById('f-notes').value.trim(), participants };
  try{
    if(id){ await fsUpdate('activities', id, data); await log('تعديل نشاط', name); }
    else { await fsAdd('activities', data); await log('إضافة نشاط', name); }
    UI.closeModal(); toast('تم الحفظ بنجاح'); App.navigate('activities');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Activities.remove = async function(id){
  if(!confirm('حذف النشاط؟')) return;
  try{ await fsDelete('activities', id); App.navigate('activities'); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---------- Reports ---------- */
Views.reports = function(){
  $content().innerHTML = `
    <div class="section-head no-print"><h2>مركز التقارير</h2></div>
    <div class="info-card-grid no-print">
      ${reportCard('كشف جميع المخدومين','قائمة كاملة ببيانات المخدومين مع المرحلة والفصل والحالة.','Reports.membersList()')}
      ${reportCard('كشف حضور خلال فترة','تقرير حضور وغياب تفصيلي حسب المرحلة/الفصل وفترة زمنية.','Reports.attendanceRange()')}
      ${reportCard('كشف حضور فردي','تقرير حضور وغياب مخدوم واحد بعينه خلال فترة محددة.','Reports.individualAttendance()')}
      ${reportCard('تقرير الحضور الإجمالي','إجمالي أيام الحضور والغياب ونسبة الحضور لكل مخدوم.','Reports.attendanceTotal()')}
      ${reportCard('الغياب المتكرر','قائمة المخدومين الذين يحتاجون متابعة بسبب الغياب.','Reports.needFollowup()')}
      ${reportCard('تقرير التقييمات','متوسط تقييم كل مخدوم خلال فترة.','Reports.evaluationsReport()')}
      ${reportCard('تقرير المتابعة','كل سجلات المتابعة الفردية.','Reports.followupsReport()')}
      ${reportCard('تقرير الأنشطة والمشاركة','قائمة الأنشطة وعدد المشاركين في كل نشاط.','Reports.activitiesReport()')}
    </div>
    <div id="report-output" style="margin-top:20px;"></div>
  `;
};
function reportCard(title,desc,fn){
  return `<div class="card card-pad">
    <h3 style="font-size:15px;margin:0 0 6px;">${title}</h3>
    <p class="muted" style="margin:0 0 12px;">${desc}</p>
    <button class="btn btn-ghost btn-sm" onclick="${fn}">إنشاء التقرير</button>
  </div>`;
}
const Reports = {};
function reportShell(title, tableHtml, extraControlsHtml){
  document.getElementById('report-output').innerHTML = `
    <div class="card card-pad">
      <div class="section-head"><h2>${title}</h2>
        <div class="toolbar no-print">${extraControlsHtml||''}<button class="btn btn-gold btn-sm" onclick="window.print()">طباعة / حفظ PDF</button></div>
      </div>
      <div class="print-only" style="margin-bottom:10px;font-size:13px;color:var(--ink-soft);">
        ${esc(DB.settings.churchName||'')} ${DB.settings.schoolName?' — '+esc(DB.settings.schoolName):''} · ${fmtDate(todayISO())}
      </div>
      ${tableHtml}
    </div>
  `;
}
Reports.membersList = function(){
  const rows = DB.members;
  reportShell('كشف جميع المخدومين ('+rows.length+')', `
    <table><thead><tr><th>الكود</th><th>الاسم</th><th>المرحلة</th><th>الفصل</th><th>الهاتف</th><th>الحالة</th></tr></thead>
    <tbody>${rows.map(m=>`<tr><td>${esc(m.code)}</td><td>${esc(m.name)}</td><td>${esc(nameOf(DB.stages,m.stageId))}</td><td>${esc(nameOf(DB.classes,m.classId))}</td><td>${esc(m.phone)}</td><td>${m.status==='inactive'?'غير نشط':'نشط'}</td></tr>`).join('')}</tbody></table>
  `);
};
Reports.attendanceRange = function(){
  const from = document.getElementById('rep-from')?.value || todayISO();
  const to = document.getElementById('rep-to')?.value || todayISO();
  const rows = DB.attendance.filter(a=>a.date>=from && a.date<=to).sort((a,b)=>new Date(b.date)-new Date(a.date));
  reportShell(`تقرير حضور من ${fmtDate(from)} إلى ${fmtDate(to)}`, `
    <table><thead><tr><th>التاريخ</th><th>المخدوم</th><th>الفصل</th><th>الحالة</th></tr></thead>
    <tbody>${rows.map(a=>`<tr><td>${fmtDate(a.date)}</td><td>${esc(nameOf(DB.members,a.memberId))}</td><td>${esc(nameOf(DB.classes,a.classId))}</td><td>${a.present?'<span class="pill pill-present">حاضر</span>':'<span class="pill pill-absent">غائب</span>'}</td></tr>`).join('')}</tbody></table>
  `, `<input type="date" id="rep-from" value="${from}" onchange="Reports.attendanceRange()"><span class="muted">إلى</span><input type="date" id="rep-to" value="${to}" onchange="Reports.attendanceRange()">`);
};
Reports.individualAttendance = function(){
  const memberId = document.getElementById('rep-ind-member')?.value || (DB.members[0]&&DB.members[0].id) || '';
  const from = document.getElementById('rep-ind-from')?.value || todayISO();
  const to = document.getElementById('rep-ind-to')?.value || todayISO();
  const m = byId(DB.members, memberId);
  const memberOptions = DB.members.map(x=>`<option value="${x.id}" ${x.id===memberId?'selected':''}>${esc(x.name)} (${esc(x.code||'')})</option>`).join('');
  if(!m){
    reportShell('كشف حضور فردي', `<p class="muted">لا يوجد مخدومون مسجلون بعد.</p>`,
      `<select id="rep-ind-member" onchange="Reports.individualAttendance()"><option value="">اختر مخدومًا</option>${memberOptions}</select>`);
    return;
  }
  const rows = DB.attendance.filter(a=>a.memberId===memberId && a.date>=from && a.date<=to).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const presentCount = rows.filter(r=>r.present).length;
  const totalCount = rows.length;
  const pct = totalCount? Math.round(presentCount/totalCount*100) : 0;
  reportShell(`كشف حضور فردي: ${esc(m.name)} — من ${fmtDate(from)} إلى ${fmtDate(to)}`, `
    <div class="kv" style="margin-bottom:16px;">
      <b>الكود</b><span>${esc(m.code||'—')}</span>
      <b>المرحلة</b><span>${esc(nameOf(DB.stages,m.stageId))}</span>
      <b>الفصل</b><span>${esc(nameOf(DB.classes,m.classId))}</span>
      <b>عدد أيام الحضور المسجلة</b><span>${totalCount}</span>
      <b>حضور</b><span>${presentCount}</span>
      <b>غياب</b><span>${totalCount-presentCount}</span>
      <b>نسبة الحضور</b><span>${pct}%</span>
    </div>
    <table><thead><tr><th>التاريخ</th><th>الحالة</th></tr></thead>
    <tbody>${rows.length? rows.map(a=>`<tr><td>${fmtDate(a.date)}</td><td>${a.present?'<span class="pill pill-present">حاضر</span>':'<span class="pill pill-absent">غائب</span>'}</td></tr>`).join('') : `<tr><td colspan="2" class="muted">لا توجد سجلات حضور في هذه الفترة</td></tr>`}</tbody></table>
  `, `
    <select id="rep-ind-member" onchange="Reports.individualAttendance()">${memberOptions}</select>
    <input type="date" id="rep-ind-from" value="${from}" onchange="Reports.individualAttendance()"><span class="muted">إلى</span>
    <input type="date" id="rep-ind-to" value="${to}" onchange="Reports.individualAttendance()">
  `);
};
Reports.attendanceTotal = function(){  const rows = DB.members.map(m=>{
    const recs = DB.attendance.filter(a=>a.memberId===m.id);
    const present = recs.filter(r=>r.present).length;
    const total = recs.length;
    return {name:m.name, stage:nameOf(DB.stages,m.stageId), present, absent:total-present, total, pct: total? Math.round(present/total*100):0};
  });
  const totalMeetings = rows.reduce((a,b)=>a+b.total,0);
  const totalPresent = rows.reduce((a,b)=>a+b.present,0);
  reportShell('تقرير الحضور الإجمالي', `
    <table><thead><tr><th>المخدوم</th><th>المرحلة</th><th>عدد الاجتماعات</th><th>حضور</th><th>غياب</th><th>نسبة الحضور</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${esc(r.stage)}</td><td>${r.total}</td><td>${r.present}</td><td>${r.absent}</td><td>${r.pct}%</td></tr>`).join('')}
    <tr style="font-weight:800;background:var(--paper);"><td colspan="2">الإجمالي العام</td><td>${totalMeetings}</td><td>${totalPresent}</td><td>${totalMeetings-totalPresent}</td><td>${totalMeetings?Math.round(totalPresent/totalMeetings*100):0}%</td></tr>
    </tbody></table>
  `);
};
Reports.needFollowup = function(){
  const rows = computeNeedFollowup();
  reportShell('مخدومون بحاجة لمتابعة ('+rows.length+')', `
    <table><thead><tr><th>الاسم</th><th>الفصل</th><th>السبب</th></tr></thead>
    <tbody>${rows.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(nameOf(DB.classes,m.classId))}</td><td>${esc(m.reason)}</td></tr>`).join('')}</tbody></table>
  `);
};
Reports.evaluationsReport = function(){
  const rows = DB.members.map(m=>{
    const evs = DB.evaluations.filter(e=>e.memberId===m.id);
    const vals = evs.flatMap(e=>Object.values(e.scores||{}));
    const avg = vals.length? (vals.reduce((a,b)=>a+Number(b),0)/vals.length).toFixed(1) : '—';
    return {name:m.name, count:evs.length, avg};
  });
  reportShell('تقرير متوسط التقييمات', `
    <table><thead><tr><th>المخدوم</th><th>عدد التقييمات</th><th>المتوسط</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.count}</td><td>${r.avg}</td></tr>`).join('')}</tbody></table>
  `);
};
Reports.followupsReport = function(){
  reportShell('تقرير المتابعة الشامل', `
    <table><thead><tr><th>التاريخ</th><th>المخدوم</th><th>الخادم</th><th>النوع</th><th>الموضوع</th></tr></thead>
    <tbody>${DB.followups.map(f=>`<tr><td>${fmtDate(f.date)}</td><td>${esc(nameOf(DB.members,f.memberId))}</td><td>${esc(nameOf(DB.servants,f.servantId))}</td><td>${esc(f.type)}</td><td>${esc(f.subject)}</td></tr>`).join('')}</tbody></table>
  `);
};
Reports.activitiesReport = function(){
  reportShell('تقرير الأنشطة والمشاركة', `
    <table><thead><tr><th>النشاط</th><th>التاريخ</th><th>المكان</th><th>عدد المشاركين</th></tr></thead>
    <tbody>${DB.activities.map(a=>`<tr><td>${esc(a.name)}</td><td>${fmtDate(a.date)}</td><td>${esc(a.place)}</td><td>${(a.participants||[]).length}</td></tr>`).join('')}</tbody></table>
  `);
};

/* ---------- Users & permissions ---------- */
Views.users = function(){
  $content().innerHTML = `
    <div class="section-head"><h2>المستخدمون والصلاحيات</h2>
      <button class="btn btn-gold btn-sm no-print" onclick="UsersV.openInviteForm()">+ دعوة مستخدم جديد</button>
    </div>
    <div class="section-head"><h2 style="font-size:14.5px;">دعوات مُعلّقة (لسه محتاجة الشخص يكمّل التسجيل)</h2></div>
    <div class="card" style="margin-bottom:22px;"><div id="invites-table-wrap"></div></div>
    <div class="section-head"><h2 style="font-size:14.5px;">المستخدمون المُفعّلون</h2></div>
    <div class="card"><div id="users-table-wrap"></div></div>
  `;
  const uRows = DB.users;
  document.getElementById('users-table-wrap').innerHTML = uRows.length ? `<table><thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th><th></th></tr></thead>
    <tbody>${uRows.map(u=>`<tr><td class="name-cell"><span class="avatar">${u.photo?`<img src="${u.photo}">`:initials(u.name)}</span>${esc(u.name)}</td><td class="muted">${esc(u.email)}</td><td>${ROLE_LABELS[u.role]||u.role}</td>
      <td><div class="row-actions"><button class="btn btn-ghost btn-sm" onclick="UsersV.openForm('${u.id}')">تعديل الدور</button>${u.id!==CURRENT_USER.uid?`<button class="btn btn-danger btn-sm" onclick="UsersV.remove('${u.id}')">حذف</button>`:''}</div></td>
    </tr>`).join('')}</tbody></table>` : `<div class="empty-state">لا يوجد مستخدمون بعد</div>`;

  UsersV.loadInvites();
};
const UsersV = {};
UsersV.loadInvites = async function(){
  const wrap = document.getElementById('invites-table-wrap');
  if(!wrap) return;
  try{
    const snap = await getDocs(query(collection(dbFire,'invites'), where('churchId','==',CURRENT_CHURCH_ID)));
    const invites = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(i=>!i.used);
    wrap.innerHTML = invites.length ? `<table><thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th><th></th></tr></thead>
      <tbody>${invites.map(i=>`<tr><td>${esc(i.name||'—')}</td><td class="muted">${esc(i.email)}</td><td>${ROLE_LABELS[i.role]||i.role}</td>
        <td><button class="btn btn-danger btn-sm" onclick="UsersV.cancelInvite('${i.id}')">إلغاء الدعوة</button></td>
      </tr>`).join('')}</tbody></table>` : `<div class="empty-state">لا توجد دعوات معلّقة</div>`;
  }catch(e){ console.error(e); wrap.innerHTML = `<div class="empty-state">تعذر تحميل الدعوات</div>`; }
};
UsersV.openInviteForm = function(){
  UI.openModal('دعوة مستخدم جديد', `
    <p class="muted" style="margin-top:0;">هيتولّد رابط دعوة، ابعته للشخص (واتساب مثلاً)، وهو هيدخل بريده وكلمة مرور من عنده ويتفعّل تلقائيًا بالدور اللي هتحدده.</p>
    <div class="form-grid">
      <div class="field"><label>اسم الشخص</label><input id="inv-name"></div>
      <div class="field"><label>البريد الإلكتروني</label><input id="inv-email" type="email"></div>
      <div class="field full"><label>الدور</label><select id="inv-role">
        <option value="servant">خادم</option>
        <option value="staff">مستخدم إداري</option>
        <option value="admin">مدير النظام</option>
      </select></div>
    </div>
  `, `<button class="btn btn-primary" onclick="UsersV.sendInvite()">إرسال الدعوة</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
UsersV.sendInvite = async function(){
  const name = document.getElementById('inv-name').value.trim();
  const email = document.getElementById('inv-email').value.trim().toLowerCase();
  const role = document.getElementById('inv-role').value;
  if(!name || !email) return toast('أدخل الاسم والبريد الإلكتروني');
  try{
    await setDoc(doc(dbFire,'invites', email), {
      name, email, role, churchId: CURRENT_CHURCH_ID, churchName: CURRENT_CHURCH?CURRENT_CHURCH.name:'',
      used:false, createdAt: Date.now(),
    });
    await log('دعوة مستخدم جديد', name+' - '+email);
    UI.closeModal();
    toast('تم إرسال الدعوة — قوله يفتح صفحة "عندك دعوة؟ انضم هنا" من شاشة الدخول ويسجّل بنفس البريد ده');
    UsersV.loadInvites();
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
UsersV.cancelInvite = async function(email){
  if(!confirm('إلغاء الدعوة دي؟')) return;
  try{ await deleteDoc(doc(dbFire,'invites', email)); toast('تم الإلغاء'); UsersV.loadInvites(); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};
UsersV.openForm = function(id){
  const u = byId(DB.users,id);
  if(!u) return;
  UI.openModal('تعديل بيانات المستخدم', `
    <div class="form-grid">
      ${photoFieldHtml(u.photo)}
      <div class="field"><label>الاسم</label><input id="f-name" value="${esc(u.name||'')}" disabled></div>
      <div class="field"><label>البريد الإلكتروني</label><input value="${esc(u.email||'')}" disabled></div>
      ${codeFieldHtml('f-code', u.code||'', 'اختياري — كود/باركود تعريفي')}
      <div class="field full"><label>الدور</label><select id="f-role">
        <option value="admin" ${u.role==='admin'?'selected':''}>مدير النظام</option>
        <option value="servant" ${u.role==='servant'?'selected':''}>خادم</option>
        <option value="staff" ${u.role==='staff'?'selected':''}>مستخدم إداري</option>
      </select></div>
    </div>
  `, `<button class="btn btn-primary" onclick="UsersV.save('${id}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
UsersV.save = async function(id){
  const role = document.getElementById('f-role').value;
  const photo = document.getElementById('f-photo-data').value;
  const code = document.getElementById('f-code').value.trim();
  try{
    await fsUpdate('users', id, {role, photo, code});
    await log('تعديل دور مستخدم', byId(DB.users,id)?.name||'');
    UI.closeModal(); toast('تم الحفظ بنجاح'); App.navigate('users');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
UsersV.remove = async function(id){
  if(!confirm('حذف صلاحية هذا المستخدم من النظام؟ (لن يحذف حساب الدخول بتاعه، فقط دوره هنا)')) return;
  try{ await fsDelete('users', id); App.navigate('users'); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---------- Settings ---------- */
Views.settings = function(){
  const s = DB.settings;
  $content().innerHTML = `
    <div class="section-head"><h2>إعدادات النظام</h2></div>
    <div class="card card-pad" style="max-width:560px;">
      <div class="form-grid">
        <div class="field full"><label>اسم الكنيسة</label><input id="s-church" value="${esc(s.churchName||'')}"></div>
        <div class="field full"><label>اسم مدرسة الأحد</label><input id="s-school" value="${esc(s.schoolName||'')}"></div>
        <div class="field full"><label>بيانات التواصل</label><input id="s-contact" value="${esc(s.contact||'')}"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="SettingsV.save()">حفظ الإعدادات</button>
    </div>

    <div class="section-head" style="margin-top:26px;"><h2>📋 قوائم المهام (أسماء الأنشطة وأنواع المتابعة)</h2></div>
    <div class="info-card-grid" style="margin-bottom:10px;">
      <div class="card card-pad">
        <b style="font-size:13px; display:block; margin-bottom:8px;">أسماء أنشطة جاهزة (تظهر كاقتراح عند إضافة نشاط)</b>
        <div style="display:flex; gap:8px; margin-bottom:10px;">
          <input id="new-activity-type" placeholder="اكتب اسم نشاط جديد..." style="flex:1; padding:8px 10px; border:1px solid var(--line); border-radius:8px;" onkeydown="if(event.key==='Enter'){SettingsV.addListItem('activityNames','new-activity-type');}">
          <button class="btn btn-primary btn-sm" onclick="SettingsV.addListItem('activityNames','new-activity-type')">+ إضافة</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${(s.activityNames||[]).length ? s.activityNames.map(v=>`<span class="pill status-pending" style="display:inline-flex; align-items:center; gap:6px;">${esc(v)} <a style="cursor:pointer; color:var(--absent); font-weight:900;" onclick="SettingsV.removeListItem('activityNames','${esc(v).replace(/'/g,"\\'")}')">✖</a></span>`).join('') : `<span class="muted">لا توجد أسماء مضافة بعد.</span>`}
        </div>
      </div>
      <div class="card card-pad">
        <b style="font-size:13px; display:block; margin-bottom:8px;">أنواع متابعة جاهزة</b>
        <div style="display:flex; gap:8px; margin-bottom:10px;">
          <input id="new-followup-type" placeholder="اكتب نوع متابعة جديد..." style="flex:1; padding:8px 10px; border:1px solid var(--line); border-radius:8px;" onkeydown="if(event.key==='Enter'){SettingsV.addListItem('followupTypes','new-followup-type');}">
          <button class="btn btn-primary btn-sm" onclick="SettingsV.addListItem('followupTypes','new-followup-type')">+ إضافة</button>
        </div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">
          ${(s.followupTypes||[]).length ? s.followupTypes.map(v=>`<span class="pill status-pending" style="display:inline-flex; align-items:center; gap:6px;">${esc(v)} <a style="cursor:pointer; color:var(--absent); font-weight:900;" onclick="SettingsV.removeListItem('followupTypes','${esc(v).replace(/'/g,"\\'")}')">✖</a></span>`).join('') : `<span class="muted">لا توجد أنواع مضافة بعد.</span>`}
        </div>
      </div>
    </div>
    <div class="section-head" style="margin-top:26px;"><h2>سجل العمليات</h2></div>
    <div class="card"><table><thead><tr><th>التاريخ</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead>
    <tbody>${DB.auditLog.slice(0,80).map(l=>`<tr><td>${fmtDate(l.date)}</td><td>${esc(l.user)}</td><td>${esc(l.action)}</td><td class="muted">${esc(l.details)}</td></tr>`).join('')}</tbody></table></div>
  `;
};
const SettingsV = {};
SettingsV.save = async function(){
  const data = {
    churchName: document.getElementById('s-church').value.trim(),
    schoolName: document.getElementById('s-school').value.trim(),
    contact: document.getElementById('s-contact').value.trim(),
  };
  try{
    await fsSet('settings', CURRENT_CHURCH_ID, data);
    document.getElementById('church-name-label').textContent = data.churchName || 'إدارة مدارس الأحد';
    await log('تعديل الإعدادات','');
    toast('تم حفظ الإعدادات');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SettingsV.addListItem = async function(field, inputId){
  const input = document.getElementById(inputId);
  const val = input.value.trim();
  if(!val) return;
  const list = DB.settings[field]||[];
  if(list.includes(val)){ toast('العنصر ده موجود بالفعل'); return; }
  try{ await fsSet('settings', CURRENT_CHURCH_ID, {[field]: [...list, val]}); input.value=''; }
  catch(e){ console.error(e); toast('تعذر الإضافة: '+e.message); }
};
SettingsV.removeListItem = async function(field, val){
  try{ await fsSet('settings', CURRENT_CHURCH_ID, {[field]: (DB.settings[field]||[]).filter(x=>x!==val)}); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---------- Backup ---------- */
Views.backup = function(){
  $content().innerHTML = `
    <div class="section-head"><h2>النسخ الاحتياطي والاستعادة</h2></div>
    <div class="card card-pad" style="max-width:560px;">
      <h3 style="font-size:14px;">نسخة احتياطية يدوية</h3>
      <p class="muted">تنزيل نسخة كاملة من بيانات النظام كملف JSON يمكن الاحتفاظ به أو استعادته لاحقًا.</p>
      <button class="btn btn-gold" onclick="BackupV.download()">تنزيل نسخة احتياطية الآن</button>
      <hr style="margin:22px 0;border:none;border-top:1px solid var(--line);">
      <h3 style="font-size:14px;">استعادة نسخة سابقة</h3>
      <p class="muted">اختر ملف نسخة احتياطية (JSON) لاستعادة البيانات منه. سيتم استبدال البيانات الحالية بالكامل.</p>
      <input type="file" id="restore-file" accept="application/json">
      <br><button class="btn btn-danger" style="margin-top:10px;" onclick="BackupV.restore()">استعادة من الملف</button>
      <p class="muted" style="margin-top:16px;">ملاحظة: بيانات النظام محفوظة تلقائيًا وبشكل مستمر أثناء الاستخدام. هذه النسخة الاحتياطية اليدوية مخصصة للأرشفة أو النقل بين الأجهزة.</p>
    </div>
  `;
};
const BackupV = {};
BackupV.download = async function(){
  const blob = new Blob([JSON.stringify(DB,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `نسخة-احتياطية-${todayISO()}.json`; a.click();
  URL.revokeObjectURL(url);
  await log('نسخة احتياطية يدوية','');
  toast('تم تنزيل النسخة الاحتياطية');
};
BackupV.restore = function(){
  const file = document.getElementById('restore-file').files[0];
  if(!file) return toast('اختر ملفًا أولاً');
  if(!confirm('سيتم استبدال البيانات الحالية في القاعدة بمحتوى الملف بالكامل. متابعة؟')) return;
  const reader = new FileReader();
  reader.onload = async function(e){
    try{
      const data = JSON.parse(e.target.result);
      const cols = ['stages','grades','classes','members','servants','attendance','evaluations','followups','activities'];
      for(const col of cols){
        for(const rec of (data[col]||[])){
          const {id, ...rest} = rec;
          await fsSet(col, id, {...rest, churchId: CURRENT_CHURCH_ID});
        }
      }
      if(data.settings) await fsSet('settings', CURRENT_CHURCH_ID, data.settings);
      await log('استعادة نسخة احتياطية','');
      toast('تم استعادة البيانات بنجاح'); App.navigate('dashboard');
    }catch(err){ console.error(err); toast('ملف غير صالح أو حدث خطأ أثناء الاستعادة'); }
  };
  reader.readAsText(file);
};

/* ---------- الاشتراك والدفع ---------- */
/* ---- رفع صور ذكي: base64 للصور الصغيرة، ورفع تلقائي لـ Cloudinary للصور الكبيرة ----
   ده بالظبط نفس النظام اللي كان مستخدم فى المشروع القديم لحل مشكلة تخطي حد حجم مستند Firestore (1 ميجا)
   لما بيتراكم أكتر من صورة/مرفق. لو الـ cloud name أو الـ preset مختلفين عندك، غيّرهم هنا. */
const CLOUDINARY_CONFIG = { cloudName: 'upxjbdew', uploadPreset: 'chat_uploads' };
async function smartImageUpload(file, maxDim=900, quality=0.65){
  const base64 = await compressImage(file, maxDim, quality);
  const approxBytes = Math.round(base64.length * 0.75); // تقدير الحجم الفعلي بعد فك ترميز base64
  if(approxBytes <= 600*1024) return base64; // صغيرة بما يكفي — تتخزن base64 مباشرة زي ما هي
  // أكبر من 600 كيلو → ترفع تلقائيًا على Cloudinary ونخزّن رابطها بس (نص قصير جدًا)
  try{
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`, {method:'POST', body:fd});
    const data = await res.json();
    if(data.secure_url) return data.secure_url;
    throw new Error((data.error&&data.error.message) || 'فشل الرفع على Cloudinary');
  }catch(e){
    console.error('Cloudinary upload failed, falling back to compressed image', e);
    return base64; // احتياطي: استخدم النسخة المضغوطة حتى لو أكبر من المثالي، أفضل من فشل كامل
  }
}
function compressImage(file, maxDim, quality){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if(w > h && w > maxDim){ h = Math.round(h*maxDim/w); w = maxDim; }
        else if(h > maxDim){ w = Math.round(w*maxDim/h); h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality||0.6));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const Billing = {};
Views.billing = function(){
  const c = CURRENT_CHURCH || {};
  const info = churchStatusInfo(c);
  const methods = DB.paymentMethods||[];
  const proofs = DB.paymentProofs||[];
  const canSubmit = CURRENT_USER.role==='admin';
  $content().innerHTML = `
    <div class="section-head"><h2>الاشتراك والدفع</h2></div>
    <div class="card card-pad" style="margin-bottom:20px;">
      <div class="kv">
        <b>حالة كنيستكم</b><span class="church-status ${info.cls}">${info.label}</span>
        <b>اسم الكنيسة</b><span>${esc(c.name||'—')}</span>
      </div>
    </div>

    ${(DB.plans||[]).length ? `
      <div class="section-head"><h2>الباقات المتاحة</h2></div>
      <div class="info-card-grid" style="margin-bottom:20px;">
        ${DB.plans.map(p=>`<div class="card card-pad">
          <h3 style="font-size:14.5px; margin:0 0 6px;">${esc(p.name)}</h3>
          <div style="font-size:17px; font-weight:800; color:var(--navy); font-family:'Markazi Text',serif;">${p.price||0} ج.م / ${p.durationDays||0} يوم</div>
          ${p.features&&p.features.length? `<ul style="margin:8px 0 0; padding-right:18px; font-size:12.5px; color:var(--ink-soft);">${p.features.map(f=>`<li>${esc(f)}</li>`).join('')}</ul>`:''}
        </div>`).join('')}
      </div>
    ` : ''}

    ${methods.length ? `
      <div class="section-head"><h2>طرق الدفع المتاحة</h2></div>
      <div class="info-card-grid" style="margin-bottom:20px;">
        ${methods.map(m=>`<div class="card card-pad">
          <h3 style="font-size:14.5px; margin:0 0 10px;">${esc(m.name)}</h3>
          <div style="display:flex; flex-direction:column; gap:10px;">
            ${methodAccountsOf(m).map(a=>`
              <div style="display:flex; align-items:center; gap:10px;">
                ${a.image? `<img src="${a.image}" onclick="UI.previewImage('${a.image.replace(/'/g,"\\'")}')" style="width:52px; height:52px; border-radius:8px; object-fit:cover; border:1px solid var(--line); cursor:pointer; flex-shrink:0;">` : ''}
                <div style="font-size:15px; font-weight:800; color:var(--navy); font-family:'Markazi Text',serif;">${linkifyText(a.value)}</div>
              </div>
            `).join('')}
          </div>
          ${m.instructions? `<p class="muted" style="margin-top:8px;">${esc(m.instructions)}</p>`:''}
        </div>`).join('')}
      </div>
    ` : `<p class="muted" style="margin-bottom:20px;">لا توجد طرق دفع مُعلنة من الإدارة حاليًا.</p>`}

    ${canSubmit ? `
      <div class="section-head"><h2>إرسال إثبات دفع</h2></div>
      <div class="card card-pad" style="max-width:520px; margin-bottom:24px;">
        <div class="field"><label>حوّلت عن طريق</label>
          <select id="proof-method">${methods.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>
        </div>
        <div class="field"><label>حوّلت من (رقمك أو اسم حسابك اللي حوّلت منه)</label>
          <input id="proof-sender" placeholder="مثال: 010xxxxxxxx أو اسمك على إنستاباي">
        </div>
        <div class="field"><label>كود خصم/أيام إضافية (لو عندك)</label>
          <input id="proof-discount" placeholder="اختياري" style="text-transform:uppercase;">
        </div>
        <div class="field"><label>صورة إثبات التحويل</label><input type="file" id="proof-file" accept="image/*"></div>
        <div class="field"><label>ملاحظة (اختياري)</label><textarea id="proof-note" rows="2" placeholder="مثال: حوّلت 200 جنيه فودافون كاش"></textarea></div>
        <button class="btn btn-gold" id="proof-submit-btn" onclick="Billing.submitProof()">إرسال للمراجعة</button>
      </div>
    ` : ''}

    <div class="section-head"><h2>سجل طلبات الدفع</h2></div>
    <div class="card">${proofs.length ? `<table><thead><tr><th>التاريخ</th><th>حوّلت عن طريق</th><th>حوّلت من</th><th>الحالة</th></tr></thead>
      <tbody>${proofs.map(p=>`<tr>
        <td>${p.createdAt? fmtDate(new Date(p.createdAt).toISOString()) : '—'}</td>
        <td class="muted">${esc(p.methodName||'—')}</td>
        <td class="muted">${esc(p.senderAccount||'—')}</td>
        <td>${p.status==='approved'?'<span class="pill pill-active">تم القبول</span>':p.status==='rejected'?'<span class="pill pill-inactive">مرفوض</span>':'<span class="church-status status-pending">قيد المراجعة</span>'}</td>
      </tr>`).join('')}</tbody></table>` : `<div class="empty-state">لا توجد طلبات دفع سابقة</div>`}</div>
  `;
};
Billing.submitProof = async function(){
  const fileInput = document.getElementById('proof-file');
  const note = document.getElementById('proof-note').value.trim();
  const senderAccount = document.getElementById('proof-sender').value.trim();
  const discountCode = document.getElementById('proof-discount').value.trim().toUpperCase();
  const methodSel = document.getElementById('proof-method');
  const methodName = methodSel && methodSel.selectedOptions[0] ? methodSel.selectedOptions[0].textContent : '';
  const btn = document.getElementById('proof-submit-btn');
  const file = fileInput.files[0];
  if(!senderAccount){ toast('من فضلك اكتب رقمك أو اسم حسابك اللي حوّلت منه، عشان الإدارة تقدر تتأكد من التحويل'); return; }
  if(!file){ toast('اختر صورة إثبات التحويل أولًا'); return; }
  btn.disabled = true; btn.textContent = 'جاري الرفع...';
  try{
    const imageBase64 = await smartImageUpload(file, 900, 0.6);
    await fsAddRaw('paymentProofs', {
      churchId: CURRENT_CHURCH_ID, churchName: CURRENT_CHURCH?CURRENT_CHURCH.name:'',
      methodId: methodSel?methodSel.value:'', methodName, senderAccount, discountCode: discountCode||null,
      note, imageBase64, status:'pending', createdAt: Date.now(),
    });
    await log('إرسال إثبات دفع', note);
    toast('تم إرسال إثبات الدفع، وهيتم مراجعته من الإدارة قريبًا');
    fileInput.value=''; document.getElementById('proof-note').value=''; document.getElementById('proof-sender').value=''; document.getElementById('proof-discount').value='';
  }catch(e){ console.error(e); toast('تعذر رفع الصورة: '+e.message); }
  finally{ btn.disabled=false; btn.textContent='إرسال للمراجعة'; }
};
window.Billing = Billing;

/* ---------- الدردشة مع الإدارة ---------- */
const Chat = {};
Views.chat = function(){
  $content().innerHTML = `
    <div class="section-head"><h2>الدردشة مع الإدارة</h2></div>
    <div class="card" style="display:flex; flex-direction:column; height:60vh;">
      <div id="chat-messages" style="flex:1; overflow-y:auto; padding:16px;"></div>
      <div style="display:flex; gap:8px; padding:12px; border-top:1px solid var(--line); align-items:center;">
        <label class="btn btn-ghost btn-sm" style="margin:0; cursor:pointer;">📎<input type="file" id="chat-file" accept="image/*" style="display:none;" onchange="Chat.previewFile()"></label>
        <input id="chat-input" placeholder="اكتب رسالتك..." style="flex:1; padding:10px 12px; border:1px solid var(--line); border-radius:8px;" onkeydown="if(event.key==='Enter') Chat.send()">
        <button class="btn btn-primary" onclick="Chat.send()">إرسال</button>
      </div>
      <div id="chat-file-preview" style="display:none; padding:0 12px 12px;"></div>
    </div>
  `;
  Chat.renderMessages();
  markChatRead((DB.chatMessages||[]).filter(m=>m.senderRole==='superadmin' && m.readByChurch===false), 'readByChurch');
};
Chat.previewFile = function(){
  const file = document.getElementById('chat-file').files[0];
  const box = document.getElementById('chat-file-preview');
  if(!file){ box.style.display='none'; box.innerHTML=''; return; }
  box.style.display='block';
  box.innerHTML = `<span class="pill pill-active">📎 ${esc(file.name)}</span> <button class="btn btn-ghost btn-sm" onclick="Chat.clearFile()">إلغاء</button>`;
};
Chat.clearFile = function(){
  document.getElementById('chat-file').value='';
  const box = document.getElementById('chat-file-preview');
  box.style.display='none'; box.innerHTML='';
};
Chat.renderMessages = function(){
  const el = document.getElementById('chat-messages');
  if(!el) return;
  const msgs = DB.chatMessages||[];
  el.innerHTML = msgs.length ? msgs.map(m=>{
    const mine = m.senderRole !== 'superadmin';
    return `<div style="display:flex; ${mine?'justify-content:flex-start;':'justify-content:flex-end;'} margin-bottom:10px;">
      <div style="max-width:72%; padding:9px 13px; border-radius:12px; font-size:13.5px; ${mine?'background:var(--paper); color:var(--ink);':'background:var(--navy); color:#fff;'}">
        <div style="display:flex; justify-content:space-between; gap:10px; font-size:11px; opacity:.7; margin-bottom:3px;">
          <span>${esc(m.senderName)}</span>
          ${mine? `<a style="cursor:pointer; color:var(--absent);" title="حذف الرسالة" onclick="deleteChatMessage('${m.id}')">🗑</a>` : ''}
        </div>
        ${m.imageBase64? chatAttachmentThumb(m.imageBase64) : ''}
        ${m.text? esc(m.text) : ''}
      </div>
    </div>`;
  }).join('') : `<p class="muted" style="text-align:center; margin-top:30px;">ابدأ المحادثة مع الإدارة من هنا.</p>`;
  el.scrollTop = el.scrollHeight;
};
Chat.send = async function(){
  const input = document.getElementById('chat-input');
  const fileInput = document.getElementById('chat-file');
  const text = input.value.trim();
  const file = fileInput.files[0];
  if(!text && !file) return;
  input.value='';
  try{
    const payload = {
      churchId: CURRENT_CHURCH_ID, senderRole: IMPERSONATING?'admin':CURRENT_USER.role, senderName: CURRENT_USER.name,
      text, createdAt: Date.now(), readBySA:false, readByChurch:true,
    };
    if(file) payload.imageBase64 = await smartImageUpload(file, 900, 0.6);
    await fsAddRaw('chatMessages', payload);
    Chat.clearFile();
  }catch(e){ console.error(e); toast('تعذر إرسال الرسالة: '+e.message); }
};
window.Chat = Chat;

/* ---------- الدعم الفني والشكاوى (نظام التذاكر) ---------- */
const Tickets = {};
const TICKET_STATUS_CLASS = {'مفتوحة':'status-pending', 'قيد المعالجة':'status-trial', 'مغلقة':'status-active', 'ملغاة':'status-expired'};
function ticketStatusPill(status){ return `<span class="pill ${TICKET_STATUS_CLASS[status]||'status-pending'}">${esc(status||'مفتوحة')}</span>`; }
Views.tickets = function(){ Tickets.render(); };
Tickets.render = function(){
  const list = DB.tickets||[];
  $content().innerHTML = `
    <div class="section-head"><h2>الدعم الفني والشكاوى</h2>
      <button class="btn btn-primary btn-sm" onclick="Tickets.openNewForm()">+ تذكرة جديدة</button>
    </div>
    ${list.length ? `<div class="card" style="padding:0;">
      ${list.map(t=>`<div style="padding:12px 16px; border-bottom:1px solid var(--line); cursor:pointer; display:flex; justify-content:space-between; align-items:center; gap:10px;" onclick="Tickets.openDetail('${t.id}')">
        <div>
          <b style="font-size:13px;">${esc(t.ticketNo)} — ${esc(t.title)}</b>
          <div class="muted" style="font-size:11.5px; margin-top:2px;">${esc(t.type||'')} · ${new Date(t.createdAt).toLocaleDateString('ar-EG')}${t.hasAdminUpdate?' · 🆕 فيه رد من الإدارة':''}</div>
        </div>
        ${ticketStatusPill(t.status)}
      </div>`).join('')}
    </div>` : `<p class="muted">لا توجد تذاكر بعد. لو عندك مشكلة أو شكوى، ابدأ تذكرة جديدة من الزرار اللي فوق.</p>`}
  `;
};
Tickets.openNewForm = function(){
  UI.openModal('تذكرة جديدة', `
    <div class="field"><label>نوع التذكرة</label>
      <select id="tk-type">${TICKET_TYPES.length ? TICKET_TYPES.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('') : `<option value="عام">عام</option>`}</select>
    </div>
    <div class="field"><label>العنوان</label><input id="tk-title" placeholder="عنوان مختصر للمشكلة/الطلب"></div>
    <div class="field"><label>التفاصيل</label><textarea id="tk-desc" rows="4" placeholder="اشرح المشكلة أو الطلب بالتفصيل..."></textarea></div>
    <div class="field"><label>مرفق (اختياري)</label><input type="file" id="tk-file" accept="image/*"></div>
    <p class="login-error" id="tk-error" style="display:block;"></p>
  `, `<button class="btn btn-primary" onclick="Tickets.submit()">إرسال التذكرة</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Tickets.submit = async function(){
  const type = document.getElementById('tk-type').value;
  const title = document.getElementById('tk-title').value.trim();
  const desc = document.getElementById('tk-desc').value.trim();
  const file = document.getElementById('tk-file').files[0];
  const errEl = document.getElementById('tk-error');
  errEl.textContent='';
  if(!title || !desc){ errEl.textContent='من فضلك اكتب العنوان والتفاصيل'; return; }
  try{
    const ticketNo = 'TKT-'+String(Date.now()).slice(-6);
    const payload = {
      ticketNo, churchId: CURRENT_CHURCH_ID, churchName: (DB.settings && DB.settings.churchName) || '',
      createdByName: CURRENT_USER.name, createdByRole: IMPERSONATING?'admin':CURRENT_USER.role,
      type, title, description: desc, status:'مفتوحة', adminReply:'', hasAdminUpdate:false, cancelledByChurch:false,
      createdAt: Date.now(), updatedAt: Date.now(), readBySA:false, readByChurch:true,
    };
    if(file) payload.attachmentImg = await smartImageUpload(file, 900, 0.6);
    await fsAddRaw('tickets', payload);
    UI.closeModal();
    toast('تم إرسال التذكرة برقم '+ticketNo);
  }catch(e){ console.error(e); errEl.textContent = 'تعذر إرسال التذكرة: '+e.message; }
};
Tickets.openDetail = function(id){
  const t = (DB.tickets||[]).find(x=>x.id===id);
  if(!t) return;
  UI.openModal(t.ticketNo, `
    ${ticketStatusPill(t.status)}
    <h3 style="margin:10px 0 4px; font-size:15px;">${esc(t.title)}</h3>
    <p class="muted" style="font-size:11.5px; margin-bottom:10px;">${esc(t.type||'')} · ${new Date(t.createdAt).toLocaleString('ar-EG')}</p>
    <p style="white-space:pre-wrap; font-size:13.5px;">${esc(t.description)}</p>
    ${t.attachmentImg? `<img src="${t.attachmentImg}" style="max-width:160px; border-radius:8px; margin-top:10px; cursor:pointer; border:1px solid var(--line);" onclick="UI.previewImage('${t.attachmentImg.replace(/'/g,"\\'")}')">`:''}
    ${t.hasAdminUpdate? `<div class="card card-pad" style="margin-top:14px; background:var(--paper);">
      <b style="font-size:12.5px; color:var(--navy);">رد الإدارة:</b>
      <p style="font-size:13px; margin-top:6px; white-space:pre-wrap;">${esc(t.adminReply||'')}</p>
    </div>` : ''}
  `, t.status==='مفتوحة' ? `<button class="btn btn-danger btn-block" onclick="Tickets.cancel('${t.id}')">🚫 إلغاء التذكرة</button>` : '');
};
Tickets.cancel = async function(id){
  if(!confirm('هل تريد إلغاء هذه التذكرة؟')) return;
  try{
    await updateDoc(doc(dbFire,'tickets',id), { status:'ملغاة', cancelledByChurch:true });
    UI.closeModal();
    toast('تم إلغاء التذكرة');
  }catch(e){ console.error(e); toast('تعذر الإلغاء: '+e.message); }
};
window.Tickets = Tickets;

/* ---------- Global search ---------- */
App.globalSearch = function(q){
  const box = document.getElementById('search-results');
  q = q.trim().toLowerCase();
  if(!q){ box.style.display='none'; return; }
  const results = [];
  DB.members.forEach(m=>{
    if([m.name,m.code,m.phone].some(v=>String(v||'').toLowerCase().includes(q)))
      results.push({label:m.name, sub:'مخدوم — '+esc(nameOf(DB.classes,m.classId)), action:`App.navigate('memberProfile','${m.id}')`});
  });
  DB.servants.forEach(s=>{
    if([s.name,s.code,s.phone].some(v=>String(v||'').toLowerCase().includes(q)))
      results.push({label:s.name, sub:'خادم', action:`Servants.viewProfile('${s.id}')`});
  });
  if(!results.length){ box.innerHTML = '<div class="sr-item muted">لا توجد نتائج</div>'; box.style.display='block'; return; }
  box.innerHTML = results.slice(0,10).map(r=>`<div class="sr-item" onclick="${r.action}">${esc(r.label)}<small>${r.sub}</small></div>`).join('');
  box.style.display = 'block';
};

/* قوالب ألوان جاهزة لمظهر النظام (تُطبّق على كل الزوار دفعة واحدة) */
const THEME_PRESETS = {
  classic: {label:'كلاسيكي (ورقي/نحاسي)', navy:'#2F5D50', gold:'#B08D57'},
  royal:   {label:'أزرق ملكي', navy:'#1F3A5F', gold:'#C9A227'},
  wine:    {label:'نبيتي كنسي', navy:'#6B1E2B', gold:'#B08D57'},
  violet:  {label:'بنفسجي أنيق', navy:'#4B3868', gold:'#B79A5B'},
  olive:   {label:'أخضر زيتوني', navy:'#33422A', gold:'#A98B4E'},
  slate:   {label:'رمادي أنثراسايت', navy:'#33383D', gold:'#B08D57'},
};
function applyTheme(key){
  const t = THEME_PRESETS[key];
  if(!t) return;
  document.documentElement.style.setProperty('--navy', t.navy);
  document.documentElement.style.setProperty('--gold', t.gold);
}

/* ---------- Boot ---------- */
document.getElementById('login-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') App.login(); });
document.getElementById('login-user').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('login-pass').focus(); });
// رابط "تواصل معنا" العام في شاشة الدخول — بيتحمّل حتى قبل تسجيل الدخول
// تسجيل الـ Service Worker (PWA) — بيسمح بتثبيت النظام كتطبيق على شاشة الموبايل
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('service-worker.js').catch(e=>console.error('SW register failed', e)); });
}
let PUBLIC_CONTACTS = {};
let ANNOUNCEMENT_DISMISSED = false;
getDoc(doc(dbFire,'platformConfig','public')).then(d=>{
  const cfg = d.exists() ? d.data() : {};
  if(cfg.theme) applyTheme(cfg.theme);
  PUBLIC_CONTACTS = cfg.contacts || {};
  const el = document.getElementById('public-contact-link');
  const hasAny = Object.values(PUBLIC_CONTACTS).some(v=>v);
  if(el && hasAny) el.style.display='block';
  if(cfg.announcement && cfg.announcement.enabled && cfg.announcement.text && !ANNOUNCEMENT_DISMISSED){
    document.getElementById('announcement-text').textContent = cfg.announcement.text;
    document.getElementById('announcement-text2').textContent = cfg.announcement.text;
    document.getElementById('announcement-bar').style.display = 'flex';
  }
}).catch(()=>{});
App.dismissAnnouncement = function(){
  ANNOUNCEMENT_DISMISSED = true;
  document.getElementById('announcement-bar').style.display = 'none';
};
/* نافذة "تواصل معنا" — قنوات تواصل مباشرة بس (بدون تذاكر، متاحة حتى لغير المسجّلين) */
App.showContactModal = function(){
  const c = PUBLIC_CONTACTS;
  const items = [
    {key:'whatsapp', ic:'💬', label:'واتساب', href: c.whatsapp},
    {key:'facebook', ic:'📘', label:'فيسبوك', href: c.facebook},
    {key:'instagram', ic:'📷', label:'إنستجرام', href: c.instagram},
    {key:'telegram', ic:'✈️', label:'تليجرام', href: c.telegram},
    {key:'instagram', ic:'📷', label:'إنستجرام', href: c.instagram},
    {key:'email', ic:'✉️', label:'البريد الإلكتروني', href: c.email? 'mailto:'+c.email : ''},
    {key:'phone', ic:'📞', label:'اتصال مباشر', href: c.phone? 'tel:'+c.phone : ''},
  ].filter(i=>i.href);
  UI.openModal('📞 تواصل معنا', `
    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(120px,1fr)); gap:10px;">
      ${items.length ? items.map(i=>`
        <a href="${esc(i.href)}" target="_blank" rel="noopener" style="text-decoration:none; color:inherit; text-align:center; border:1px solid var(--line); border-radius:10px; padding:16px 8px;">
          <div style="font-size:26px; margin-bottom:6px;">${i.ic}</div>
          <div style="font-size:12.5px; color:var(--ink);">${i.label}</div>
        </a>
      `).join('') : `<p class="muted">لا توجد وسائل تواصل مُعلنة حاليًا.</p>`}
    </div>
  `, `<button class="btn btn-ghost btn-block" onclick="UI.closeModal()">إغلاق</button>`);
};
// ملاحظة: باقي الإقلاع (تحميل بيانات المستخدم والتنقل للوحة التحكم) يتم داخل onAuthStateChanged بالأعلى.

/* تعريض الكائنات اللازمة للـ window لأن هذا الملف module والـ onclick في الـ HTML بيدور في النطاق العام */
window.App = App; window.UI = UI; window.Members = Members; window.Servants = Servants;
window.Stages = Stages; window.Attendance = Attendance; window.Evaluations = Evaluations;
window.Followups = Followups; window.Activities = Activities; window.Reports = Reports;
window.UsersV = UsersV; window.SettingsV = SettingsV; window.BackupV = BackupV;
