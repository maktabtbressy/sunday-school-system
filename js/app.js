
/* =========================================================
   نظام إدارة مدارس الأحد
   ========================================================= */

/* رقم إصدار التطبيق: بيظهر أسفل القائمة الجانبية عشان تتأكد إنك رافع آخر نسخة. بيتزوّد مع كل تسليم جديد. */
const APP_VERSION = '1.8 — تقرير تقييمات تفصيلي ودليل أولياء الأمور';
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
  Scanner._onResult = onResult;
  document.getElementById('scanner-hint').textContent = 'وجّه الكاميرا نحو الكود...';
  document.getElementById('scanner-overlay').classList.add('open');
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
    if(!video || !document.getElementById('scanner-overlay').classList.contains('open')){ stream.getTracks().forEach(t=>t.stop()); return; } // النافذة اتقفلت قبل ما الكاميرا تجهز
    video.srcObject = stream;
    await video.play();
    Scanner._tick();
  }catch(e){
    const hint = document.getElementById('scanner-hint');
    if(hint) hint.textContent = 'تعذر تشغيل الكاميرا: '+e.message+' — تأكد من السماح بالوصول للكاميرا';
  }
};
Scanner._tick = function(){
  if(!document.getElementById('scanner-overlay').classList.contains('open')) return; // اتقفلت
  const video = document.getElementById('scanner-video');
  const canvas = document.getElementById('scanner-canvas');
  if(!video || !canvas) return;
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
  const overlay = document.getElementById('scanner-overlay');
  if(overlay) overlay.classList.remove('open');
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
/* معاينة أي صورة رمزية (مخدوم/خادم/مستخدم) بالضغط عليها — بيانات الصورة فى data-photo لتفادي مشاكل تهريب النص */
function previewAvatarClick(e){
  e.stopPropagation();
  const src = e.currentTarget.getAttribute('data-photo');
  if(src) UI.previewImage(src);
}
/* ---- طباعة بطاقة QR (للمخدوم أو الخادم) — بتفتح نافذة طباعة منفصلة بتصميم بطاقة صغيرة ---- */
async function printPersonCard(person, subLabel){
  if(!person || !person.code){ toast('لازم يكون عنده كود مسجّل الأول'); return; }
  // بنستخدم خدمة صورة مباشرة (بدون مكتبة JS) عشان نتجنب أي مشكلة تحميل مكتبة من الإنترنت
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(person.code)}`;
  const w = window.open('', '_blank');
  if(!w){ toast('برجاء السماح بفتح نوافذ منبثقة لطباعة البطاقة'); return; }
  w.document.write(`
    <html dir="rtl"><head><meta charset="utf-8"><title>بطاقة ${esc(person.name)}</title>
    <style>
      body{font-family:'Tahoma',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#f4f5f2;}
      .card{width:320px; border:2px solid #2F5D50; border-radius:18px; padding:22px; text-align:center; background:#fff;}
      .card .photo{width:70px; height:70px; border-radius:50%; object-fit:cover; margin-bottom:8px;}
      .card img.qr{width:180px; height:180px; margin:12px auto; display:block;}
      .card h2{margin:6px 0 2px; color:#2F5D50; font-size:19px;}
      .card .sub{color:#8A5A20; font-size:12.5px; margin-bottom:4px;}
      .card .code{font-family:monospace; font-size:14px; color:#555; letter-spacing:1px;}
      @media print{ body{background:#fff;} }
    </style></head>
    <body>
      <div class="card">
        ${person.photo? `<img class="photo" src="${person.photo}">` : ''}
        <h2>${esc(person.name)}</h2>
        <div class="sub">${esc(subLabel||'')}</div>
        <img class="qr" src="${qrUrl}">
        <div class="code">${esc(person.code)}</div>
      </div>
      <script>window.onload=function(){ setTimeout(function(){ window.print(); }, 500); };</script>
    </body></html>
  `);
  w.document.close();
}
window.printPersonCard = printPersonCard;
/* طباعة بطاقات لعدة أشخاص دفعة واحدة (شبكة بطاقات فى ورقة واحدة) */
function printCardsGrid(people){
  const cardsHtml = people.map(p=>{
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(p.code)}`;
    return `
      <div class="card">
        ${p.photo? `<img class="photo" src="${p.photo}">` : ''}
        <h3>${esc(p.name)}</h3>
        <img class="qr" src="${qrUrl}">
        <div class="code">${esc(p.code)}</div>
      </div>`;
  }).join('');
  const w = window.open('', '_blank');
  if(!w){ toast('برجاء السماح بفتح نوافذ منبثقة للطباعة'); return; }
  w.document.write(`
    <html dir="rtl"><head><meta charset="utf-8"><title>بطاقات مجموعة</title>
    <style>
      body{font-family:'Tahoma',sans-serif; margin:0; padding:16px; background:#fff;}
      .grid{display:grid; grid-template-columns:repeat(3, 1fr); gap:14px;}
      .card{border:1.5px solid #2F5D50; border-radius:14px; padding:12px; text-align:center; page-break-inside:avoid;}
      .card .photo{width:44px; height:44px; border-radius:50%; object-fit:cover; margin-bottom:4px;}
      .card img.qr{width:110px; height:110px; margin:6px auto; display:block;}
      .card h3{margin:4px 0 2px; color:#2F5D50; font-size:13px;}
      .card .code{font-family:monospace; font-size:11px; color:#555;}
      @media print{ .grid{grid-template-columns:repeat(3, 1fr);} }
    </style></head>
    <body>
      <div class="grid">${cardsHtml}</div>
      <script>window.onload=function(){ setTimeout(function(){ window.print(); }, 500); };</script>
    </body></html>
  `);
  w.document.close();
}
window.printCardsGrid = printCardsGrid;
window.previewAvatarClick = previewAvatarClick;
/* ---- إشعارات المتصفح (تشتغل والتاب فاتح فى الخلفية بس — مفيش سيرفر بريد/Push حقيقي) ---- */
function enableBrowserNotifications(){
  if(!('Notification' in window)){ toast('المتصفح ده مش بيدعم الإشعارات'); return; }
  if(Notification.permission === 'granted'){ toast('الإشعارات مفعّلة بالفعل'); return; }
  if(Notification.permission === 'denied'){
    toast('اترفض الإذن قبل كده — المتصفح مبيسألش تاني تلقائيًا. لازم تفعّله يدوي من إعدادات الموقع (اضغط على 🔒 جنب رابط الموقع فوق ← الإشعارات ← سماح)');
    return;
  }
  Notification.requestPermission().then(perm=>{
    if(perm==='granted'){ toast('تم تفعيل الإشعارات ✅'); if(CURRENT_PAGE==='settings') Views.settings(); }
    else toast('تم رفض الإذن — تقدر تفعّله من إعدادات المتصفح لاحقًا');
  });
}
function notifyUser(title, body){
  if(!('Notification' in window) || Notification.permission!=='granted') return;
  if(!document.hidden) return; // مفيش داعي إشعار لو المستخدم شايف الشاشة فعليًا
  try{ new Notification(title, {body, icon:'icons/icon-192.png'}); }catch(e){ console.error(e); }
}
window.enableBrowserNotifications = enableBrowserNotifications;
window.Scanner = Scanner;
/* هذه الدوال بتتنادى من داخل onclick/onchange/oninput فى الـ HTML مباشرة، وبما إن app.js
   شغّال كـ ES module فكل الدوال بتبقى محجوبة جوه نطاق الملف ومش متاحة عالميًا تلقائيًا —
   لازم نصدّرها لـ window يدويًا، وإلا أي زرار أو حقل بيستخدمها هيفشل بصمت (مفيش أي رد فعل). */
window.mpOnStageChange = mpOnStageChange;
window.mpOnGradeChange = mpOnGradeChange;
window.mpRenderResults = mpRenderResults;
window.mpSelect = mpSelect;
window.mpClear = mpClear;
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
      <input id="${fieldId}-search" placeholder="بحث بالاسم أو الكود..." oninput="mpRenderResults('${fieldId}')" onkeydown="if(event.key==='Enter'){ mpSelectByCode('${fieldId}', this.value); this.value=''; }" style="flex:1; min-width:140px;">
      <button type="button" class="btn btn-ghost btn-sm" onclick="Scanner.open(v=>mpSelectByCode('${fieldId}', v))">📷</button>
    </div>
    <input type="hidden" id="${fieldId}" value="${selectedId||''}">
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
      <span id="${fieldId}-selected" class="muted">${sel? '✅ المختار: '+esc(sel.name) : 'اكتب اسم/كود أو اختار مرحلة للبحث'}</span>
      ${selectedId? `<a style="cursor:pointer; color:var(--absent); font-size:12px; font-weight:700;" onclick="mpClear('${fieldId}')">✖ إلغاء التحديد</a>` : ''}
    </div>
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
  const wrap = document.getElementById(fieldId+'-selected').parentElement;
  wrap.innerHTML = `<span id="${fieldId}-selected" class="muted">✅ المختار: ${esc(m?m.name:'')}</span><a style="cursor:pointer; color:var(--absent); font-size:12px; font-weight:700;" onclick="mpClear('${fieldId}')">✖ إلغاء التحديد</a>`;
  document.getElementById(fieldId+'-results').innerHTML = '';
  document.getElementById(fieldId+'-search').value = '';
}
function mpClear(fieldId){
  document.getElementById(fieldId).value = '';
  const wrap = document.getElementById(fieldId+'-selected').parentElement;
  wrap.innerHTML = `<span id="${fieldId}-selected" class="muted">اكتب اسم/كود أو اختار مرحلة للبحث</span>`;
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
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification, deleteUser,
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
let CHURCH_ACCESS_LOCKED = false; // true لو اشتراك الكنيسة منتهي — بيسمح بس بالفوترة/الدردشة/التذاكر
const CHURCH_LOCKED_ALLOWED_PAGES = ['billing','chat','tickets'];
let CURRENT_CHURCH = null;
/* تأكيد البريد إلزامي بس للحسابات اللي اتعملت من التاريخ ده وبعده — الحسابات الأقدم (كل المستخدمين الحاليين) بتفضل شغالة عادي من غير أي خطوة إضافية. */
const EMAIL_VERIFY_CUTOFF_MS = Date.parse('2026-09-22T00:00:00Z');
const CHAT_RETENTION_MS = 30*86400000;   // مدة الاحتفاظ برسائل الشات: 30 يوم، بعدها بتتحذف نهائيًا (انظر Chat.renderMessages و SuperAdmin.purgeOldChatMessages)
let REGISTERING = false;
let PUBLIC_ANNOUNCEMENT = null;   // إعدادات الإعلان (بتتخزن هنا وتتعرض بس بعد تسجيل الدخول، انظر maybeShowAnnouncement) // true أثناء تنفيذ عملية تسجيل كنيسة جديدة (لتجاهل onAuthStateChanged المؤقت)
let HOLD_AUTH_SCREEN_UNTIL = 0; // لحظة تنتهي عندها "إمساك" شاشة الرسالة بعد signOut (انظر showPendingAndSignOut)

const TRIAL_DAYS = 14;

/* المجموعات الخاصة ببيانات كل كنيسة (معلّمة بحقل churchId) */
const LIVE_COLLECTIONS = ['stages','grades','classes','members','servants','attendance','evaluations','followups','activities'];
let unsubscribers = [];

/* ---------- تقييد الخادم بفصله (Scope) ----------
   لما المدير يشغّل "تقييد الخادم بفصله" من الإعدادات، حساب "خادم" مربوط بسجل خادم بيشوف بيانات فصوله بس:
   الفصول/الصفوف/المراحل، المخدومين، الحضور، التقييمات، والمتابعات. بنطبّق ده في نقطة واحدة: بعد تحميل البيانات الخام (RAW)
   بنبني منها DB المفلتر، فكل الصفحات والبحث والتقارير بتشوف المفلتر تلقائيًا. (تقييد في الواجهة — البيانات نفسها بتوصل للمتصفح.) */
const RAW = {};
const SCOPED_COLS = ['stages','grades','classes','members','attendance','evaluations','followups'];
function servantClassIds(sv){ return [...new Set([sv && sv.classId, ...((sv && sv.extraClassIds) || [])].filter(Boolean))]; }
const Scope = {};
Scope.current = function(){
  if(!CURRENT_USER || IMPERSONATING || CURRENT_USER.role !== 'servant') return null;
  if(!(DB.settings && DB.settings.restrictServants)) return null;
  const sv = CURRENT_USER.servantId ? (RAW.servants || DB.servants || []).find(s=>s.id === CURRENT_USER.servantId) : null;
  return { linked: !!sv, servantId: sv ? sv.id : null, classIds: new Set(sv ? servantClassIds(sv) : []) };
};
Scope.apply = function(){
  const sc = Scope.current();
  const src = c => RAW[c] || [];
  if(!sc){ SCOPED_COLS.forEach(c=>{ if(RAW[c]) DB[c] = RAW[c]; }); return; }
  const cls = src('classes').filter(c=>sc.classIds.has(c.id));
  const gradeIds = new Set(cls.map(c=>c.gradeId)), stageIds = new Set(cls.map(c=>c.stageId));
  const members = src('members').filter(m=>sc.classIds.has(m.classId));
  const memberIds = new Set(members.map(m=>m.id));
  DB.classes = cls;
  DB.grades = src('grades').filter(g=>gradeIds.has(g.id));
  DB.stages = src('stages').filter(s=>stageIds.has(s.id));
  DB.members = members;
  DB.attendance = src('attendance').filter(a=>sc.classIds.has(a.classId) || memberIds.has(a.memberId));
  DB.evaluations = src('evaluations').filter(e=>memberIds.has(e.memberId));
  DB.followups = src('followups').filter(f=>memberIds.has(f.memberId));
};
Scope.banner = function(){
  const sc = Scope.current(); if(!sc) return '';
  const names = [...sc.classIds].map(id=>nameOf(DB.classes, id)).filter(Boolean).join('، ');
  const msg = !sc.linked
    ? '🔒 حسابك لسه مش مربوط بسجل خادم، فمفيش بيانات ظاهرة. كلّم مدير الكنيسة يربط حسابك من "المستخدمون والصلاحيات".'
    : (sc.classIds.size ? `🔒 بتشوف بيانات فصولك بس: <b>${esc(names)}</b>` : '🔒 مفيش فصل متسجّل لك لسه، فمفيش بيانات ظاهرة. كلّم مدير الكنيسة.');
  return `<div class="card card-pad no-print" style="margin-bottom:14px; ${sc.linked && sc.classIds.size ? '' : 'border-color:var(--absent);'}">${msg}</div>`;
};
Scope.settingsCardHtml = function(){
  const on = !!DB.settings.restrictServants;
  const svUsers = (DB.users || []).filter(u=>u.role === 'servant');
  const unlinked = svUsers.filter(u=>!u.servantId || !byId(DB.servants, u.servantId));
  const noClass = DB.servants.filter(s=>s.status !== 'inactive' && !servantClassIds(s).length);
  return `<div class="section-head" style="margin-top:26px;"><h2>🔒 تقييد الخادم بفصله</h2></div>
    <div class="card card-pad" style="max-width:760px; margin-bottom:10px;">
      <p class="muted" style="margin:0 0 10px;">لما تشغّله، حساب "خادم" بيشوف ويسجّل حضور فصوله بس (المخدومين، الحضور، التقييمات، المتابعات). المدير والمستخدم الإداري بيشوفوا كل حاجة. لازم الأول تربط كل حساب خادم بسجله من "المستخدمون والصلاحيات"، وتحدد فصل الخادم من صفحة الخدام.</p>
      <p style="margin:0 0 8px;">حسابات الخدام: <b>${svUsers.length}</b> · مربوطة: <b>${svUsers.length - unlinked.length}</b></p>
      ${unlinked.length ? `<p style="margin:0 0 8px; color:var(--absent);">⚠️ حسابات خدام مش مربوطة (هيشوفوا لا حاجة لو شغّلت التقييد): ${unlinked.map(u=>esc(u.name)).join('، ')}</p>` : ''}
      ${noClass.length ? `<p style="margin:0 0 8px; color:var(--absent);">⚠️ خدام من غير فصل: ${noClass.map(s=>esc(s.name)).join('، ')}</p>` : ''}
      <label style="display:flex; gap:8px; align-items:center; cursor:pointer; font-weight:600; margin-top:10px;"><input type="checkbox" id="set-restrict" ${on?'checked':''} onchange="SettingsV.setRestrictServants(this.checked)"> تقييد الخادم بفصله</label>
      <p class="muted" style="margin:10px 0 0; font-size:12.5px;">ملاحظة: ده تقييد في الواجهة (بيمنع العرض الغلط)، مش حماية كاملة على السيرفر.</p>
    </div>`;
};
function detachListeners(){ unsubscribers.forEach(u=>u()); unsubscribers = []; Object.keys(RAW).forEach(k=>delete RAW[k]); }

function attachListeners(onReady){
  const isAdmin = CURRENT_USER && (CURRENT_USER.role==='admin' || IMPERSONATING);
  let pending = LIVE_COLLECTIONS.length + 2 + (isAdmin?1:0); // + settings + auditLog + (users لو مدير كنيسة)
  const tick = () => { pending--; if(pending<=0 && onReady) { onReady(); onReady=null; } renderCurrent(); updateAttentionBadges(); };

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
      RAW[col] = snap.docs.map(d=>({id:d.id, ...d.data()})).filter(x=>!x.deletedAt);
      DB[col] = RAW[col];
      if(SCOPED_COLS.includes(col) || col === 'servants') Scope.apply();
      tick();
    }, err=>{ console.error(col, err); toast('تعذر تحميل بيانات: '+col); });
    unsubscribers.push(unsub);
  });

  const unsubSettings = onSnapshot(doc(dbFire,'settings',CURRENT_CHURCH_ID), d=>{
    DB.settings = d.exists() ? d.data() : {churchName: CURRENT_CHURCH?CURRENT_CHURCH.name:'', schoolName:'مدرسة الأحد', contact:CURRENT_CHURCH?CURRENT_CHURCH.contactPhone:''};
    document.getElementById('church-name-label').textContent = DB.settings.churchName || 'إدارة مدارس الأحد';
    updateSidebarPhoto();
    Scope.apply();
    IdleTimer.start();   // ممكن تتغيّر مدة الخمول وهو داخل
    tick();
  }, err=>console.error(err));
  unsubscribers.push(unsubSettings);

  // حساب المستخدم نفسه لحظيًا: لو المدير ربطه بسجل خادم (servantId) يتحدّث التقييد من غير ما يعمل تسجيل دخول تاني
  if(!IMPERSONATING && CURRENT_USER && CURRENT_USER.uid){
    const unsubMe = onSnapshot(doc(dbFire,'users',CURRENT_USER.uid), d=>{
      if(!d.exists()) return;
      const sid = d.data().servantId || '';
      if((CURRENT_USER.servantId || '') !== sid){ CURRENT_USER.servantId = sid; Scope.apply(); renderCurrent(); }
    }, err=>console.error(err));
    unsubscribers.push(unsubMe);
  }

  const auditQ = query(collection(dbFire,'auditLog'), where('churchId','==',CURRENT_CHURCH_ID), orderBy('date','desc'), limit(200));
  const unsubAudit = onSnapshot(auditQ, snap=>{
    DB.auditLog = snap.docs.map(d=>({id:d.id, ...d.data()}));
    tick();
  }, err=>console.error(err));
  unsubscribers.push(unsubAudit);

  // متابعة حالة اشتراك الكنيسة نفسها لحظيًا (عشان الشاشة تتحدث فور موافقة/تفعيل الإدارة)
  const unsubChurch = onSnapshot(doc(dbFire,'churches',CURRENT_CHURCH_ID), d=>{
    if(!d.exists()) return;
    CURRENT_CHURCH = d.data();
    const now = Date.now();
    const isExempt = CURRENT_CHURCH.status === 'exempt';
    const trialValid = CURRENT_CHURCH.status==='trial' && CURRENT_CHURCH.trialEndsAt && new Date(CURRENT_CHURCH.trialEndsAt).getTime() > now;
    const activeValid = CURRENT_CHURCH.status==='active' && CURRENT_CHURCH.activeUntil && new Date(CURRENT_CHURCH.activeUntil).getTime() > now;
    const wasLocked = CHURCH_ACCESS_LOCKED;
    CHURCH_ACCESS_LOCKED = !isExempt && !trialValid && !activeValid;
    if(wasLocked !== CHURCH_ACCESS_LOCKED){
      buildNav();
      if(!CHURCH_ACCESS_LOCKED) toast('🎉 تم تفعيل الاشتراك — كل صفحات النظام بقت متاحة تاني');
      if(CURRENT_PAGE==='billing') renderCurrent();
    }
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
  let chatFirstLoad = true;
  const unsubChat = onSnapshot(query(collection(dbFire,'chatMessages'), where('churchId','==',CURRENT_CHURCH_ID)), snap=>{
    DB.chatMessages = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    const unread = DB.chatMessages.filter(m=> m.senderRole==='superadmin' && m.readByChurch===false);
    App.updateNavBadge('chat', unread.length);
    if(!chatFirstLoad && unread.length) notifyUser('💬 رسالة جديدة من الإدارة', unread[unread.length-1].text||'مرفق صورة');
    chatFirstLoad = false;
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
  let ticketsFirstLoad = true;
  const unsubTickets = onSnapshot(query(collection(dbFire,'tickets'), where('churchId','==',CURRENT_CHURCH_ID)), snap=>{
    DB.tickets = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const unread = DB.tickets.filter(t=> t.readByChurch===false);
    App.updateNavBadge('tickets', unread.length);
    if(!ticketsFirstLoad && unread.length) notifyUser('🎫 تحديث على تذكرتك', unread[unread.length-1].ticketNo+' — فيه رد جديد من الإدارة');
    ticketsFirstLoad = false;
    if(CURRENT_PAGE==='tickets'){ Tickets.render(); markChatRead(unread, 'readByChurch', 'tickets'); }
  }, err=>console.error(err));
  unsubscribers.push(unsubTickets);

  // خطط الاشتراك المعلنة (معلوماتية)
  const unsubPlans = onSnapshot(collection(dbFire,'subscriptionPlans'), snap=>{
    DB.plans = snap.docs.map(d=>({id:d.id, ...d.data()}));
    if(CURRENT_PAGE==='billing') Views.billing();
  }, err=>console.error(err));
  unsubscribers.push(unsubPlans);

  // حالة الجلسة النشطة وطابور الانتظار فى الدردشة
  const unsubChatSession = onSnapshot(doc(dbFire,'platformConfig','chatSession'), d=>{
    CHAT_SESSION = d.exists() ? d.data() : {activeChurchId:null, queue:[]};
    if(CURRENT_PAGE==='chat') Chat.renderQueueBanner();
  }, err=>console.error(err));
  unsubscribers.push(unsubChatSession);
}

/* كل تحديث لحظي من Firestore بيعيد رسم الصفحة الحالية من الصفر. ده كان بيمسح شغل المستخدم اللي لسه ماتحفظش لو خادم تاني حفظ أي حاجة
   في نفس الوقت (بالذات صباح الأحد وكذا خادم بيسجّلوا حضور فصول مختلفة). فبنسيب الصفحة زي ما هي في الحالات دي: */
function shouldHoldLiveRender(){
  const content = document.getElementById('content');
  if(!content) return false;
  // صفحة الحضور بعد اختيار فصل: العلامات اللي ماتحفظتش والقائمة الظاهرة تفضل زي ما هي (بتتحدّث عند اختيار فصل/تاريخ تاني)
  if(CURRENT_PAGE === 'attendance'){ const c = document.getElementById('att-class'); if(c && c.value) return true; }
  // تقرير معروض (سنوي أو غيره): مايختفيش لما بيانات تتغير أثناء القراءة/الطباعة
  if(CURRENT_PAGE === 'reports'){ const o = document.getElementById('report-output'); if(o && o.innerHTML.trim()) return true; }
  // المستخدم بيكتب في خانة نص متعددة الأسطر (زي قوالب واتساب في الإعدادات)
  const a = document.activeElement;
  if(a && a.tagName === 'TEXTAREA' && content.contains(a)) return true;
  return false;
}
function renderCurrent(){
  if(document.getElementById('app').style.display==='none') return;
  if(shouldHoldLiveRender()) return;
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
/* ---------- منع خروج بالغلط بزرار الرجوع (لما التطبيق متثبّت كـ PWA) ----------
   زرار رجوع الموبايل بيقفل أي حاجة مفتوحة (مودال/قارئ باركود/وضع الاستقبال/القائمة الجانبية) الأول،
   ولو مفيش حاجة مفتوحة، أول ضغطة بتوريه تنبيه "اضغط رجوع تاني للخروج" بدل ما تقفل التطبيق فورًا،
   وضغطة تانية خلال 2.5 ثانية هي اللي فعلًا بتخرج. */
function isInstalledPWA(){
  try{ return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
  catch(_){ return false; }
}
let _backPressAt = 0;
function initExitGuard(){
  if(!isInstalledPWA()) return;
  history.pushState({appGuard:true}, '', location.href);
  window.addEventListener('popstate', function(){
    const modalOpen = document.getElementById('modal-backdrop') && document.getElementById('modal-backdrop').classList.contains('open');
    const scannerOpen = document.getElementById('scanner-overlay') && document.getElementById('scanner-overlay').classList.contains('open');
    const receptionOpen = !!document.getElementById('reception-overlay');
    const lightboxOpen = !!document.getElementById('photo-lightbox');
    const evOpen = !!document.getElementById('email-verify-screen');
    const sidebarOpen = document.getElementById('sidebar') && document.getElementById('sidebar').classList.contains('open');
    const saSidebarOpen = document.getElementById('sa-sidebar') && document.getElementById('sa-sidebar').classList.contains('open');
    if(lightboxOpen){ closeChurchPhotoLightbox(); history.pushState({appGuard:true}, '', location.href); return; }
    if(receptionOpen){ Reception.close(); history.pushState({appGuard:true}, '', location.href); return; }
    if(modalOpen){ UI.closeModal(); history.pushState({appGuard:true}, '', location.href); return; }
    if(scannerOpen){ Scanner.close(); history.pushState({appGuard:true}, '', location.href); return; }
    if(evOpen){ history.pushState({appGuard:true}, '', location.href); return; }   // شاشة تأكيد البريد: منقفلهاش بزرار الرجوع
    if(sidebarOpen){ UI.closeSidebar(); history.pushState({appGuard:true}, '', location.href); return; }
    if(saSidebarOpen){ UI.closeSaSidebar(); history.pushState({appGuard:true}, '', location.href); return; }
    const now = Date.now();
    if(now - _backPressAt < 2500){ return; }   // ضغطة تانية خلال المهلة: سيبها تخرج فعليًا (من غير إعادة تعبئة الـ history)
    _backPressAt = now;
    toast('اضغط رجوع مرة تانية للخروج');
    history.pushState({appGuard:true}, '', location.href);
  });
}
document.addEventListener('DOMContentLoaded', initExitGuard);
if(document.readyState !== 'loading') initExitGuard();

/* إغلاق كاميرا الباركود تلقائيًا فى أي سيناريو تاني ممكن ينسى فيه المستخدم الكاميرا شغالة */
function stopScannerIfActive(){
  if(window.Scanner && Scanner._stream){ Scanner._stream.getTracks().forEach(t=>t.stop()); Scanner._stream=null; }
  if(window.Scanner && Scanner._raf){ cancelAnimationFrame(Scanner._raf); Scanner._raf=null; }
  const scannerOverlay = document.getElementById('scanner-overlay');
  if(scannerOverlay) scannerOverlay.classList.remove('open');
}
document.addEventListener('visibilitychange', ()=>{ if(document.hidden) stopScannerIfActive(); });
window.addEventListener('pagehide', stopScannerIfActive);
window.addEventListener('beforeunload', stopScannerIfActive);

/* ---- تسجيل خروج تلقائي بعد فترة خمول طويلة (حماية للأجهزة المشتركة) ---- */
const IDLE_LIMIT_MS = 30*60*1000; // 30 دقيقة
let lastActivityAt = Date.now();
['mousemove','keydown','click','touchstart','scroll'].forEach(evt=>{
  document.addEventListener(evt, ()=>{ lastActivityAt = Date.now(); }, {passive:true});
});
setInterval(()=>{
  if(!CURRENT_USER) return; // مفيش حد داخل أصلاً
  if(Date.now() - lastActivityAt > IDLE_LIMIT_MS){
    lastActivityAt = Date.now(); // نمنع تكرار الاستدعاء
    toast('تم تسجيل الخروج تلقائيًا بسبب عدم النشاط لفترة طويلة');
    App.logout();
  }
}, 60000);
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
  if(IMPERSONATING) return; // المالك داخل مؤقتًا على لوحة كنيسة — لا يُسجَّل أي إجراء له فى سجل الكنيسة إطلاقًا (خصوصية الطرفين)
  try{
    const payload = { date: new Date().toISOString(), user: CURRENT_USER ? CURRENT_USER.name : '—', action, details: details||'' };
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
  ['login-screen','register-screen','pending-screen','locked-screen','forgot-screen','join-screen','maintenance-screen'].forEach(id=>{
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
/* شاشة رسالة (قيد المراجعة / مرفوض / مفيش كنيسة) ثم تسجيل خروج.
   signOut بيشغّل onAuthStateChanged(null) اللي بيرجّع شاشة الدخول ويخفي الرسالة فورًا،
   فبنعلّم إن الـ callback اللي جاي (خلال 4 ثواني) خاص بالخروج ده ونسيب شاشة الرسالة ظاهرة. */
async function showPendingAndSignOut(msg){
  showPendingScreen(msg);
  HOLD_AUTH_SCREEN_UNTIL = Date.now() + 4000;
  try{ await signOut(auth); }catch(_){ HOLD_AUTH_SCREEN_UNTIL = 0; }
}
/* رسالة على شاشة الدخول ثم تسجيل خروج.
   signOut بيشغّل onAuthStateChanged(null) اللي بيرجّع شاشة الدخول ويخفي أي شاشة تانية،
   عشان كده الرسالة بتتحط في login-error (ما بيتمسحش) عشان تفضل ظاهرة للمستخدم. */
async function signOutWithNotice(msg){
  hideAllAuthScreens();
  const el = document.getElementById('login-error');
  el.textContent = msg; el.style.display = 'block';
  document.getElementById('login-screen').style.display = 'flex';
  try{ await signOut(auth); }catch(_){}
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
  // false = البريد ليه حساب دخول قديم في Firebase Auth (مثلًا اتحذف من الكنيسة وبيتدعى تاني):
  // في الحالة دي مانحذفش الحساب أبدًا لو حصل أي فشل، بس نسجّل خروج.
  let isNewAccount = true;
  const undoSession = async ()=>{
    if(!cred) return;
    try{ if(isNewAccount) await deleteUser(cred.user); else await signOut(auth); }catch(_){}
    cred = null;
  };
  try{
    try{
      cred = await createUserWithEmailAndPassword(auth, email, pass);
    }catch(e){
      if(!(e && e.code === 'auth/email-already-in-use')) throw e;
      // البريد ليه حساب قديم: نتأكد إنه صاحبه بكلمة المرور، وبعدين نكمل بنفس الحساب بدل ما نرفض
      isNewAccount = false;
      try{
        cred = await signInWithEmailAndPassword(auth, email, pass);
      }catch(e2){
        const c = (e2 && e2.code) || '';
        if(c==='auth/wrong-password' || c==='auth/invalid-credential' || c==='auth/invalid-login-credentials'){
          err.textContent = 'البريد ده مسجّل قبل كده في النظام. اكتب كلمة المرور القديمة بتاعتك، أو لو نسيتها ارجع لشاشة الدخول واضغط "نسيت كلمة المرور؟" وبعدين ارجع هنا.';
          err.style.display='block';
          return;
        }
        throw e2;
      }
      // لو الحساب ده مفعّل فعلًا في النظام (له مستند دور) مايتلمسش — يسجّل دخول عادي
      const existing = await getDoc(doc(dbFire,'users', cred.user.uid));
      if(existing.exists()){
        await undoSession();
        err.textContent = 'الحساب ده مفعّل بالفعل في النظام — سجّل دخول عادي من الشاشة الرئيسية.';
        err.style.display='block';
        return;
      }
    }
    const inviteSnap = await getDoc(doc(dbFire,'invites', email));
    if(!inviteSnap.exists() || inviteSnap.data().used){
      await undoSession();
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
    if(!cred.user.emailVerified){ try{ await sendEmailVerification(cred.user); }catch(_){} }
    await signOut(auth);
    document.getElementById('join-screen').style.display='none';
    document.getElementById('pending-message').textContent = isNewAccount
      ? 'تم تفعيل حسابك بنجاح! سجّل الدخول دلوقتي بنفس البريد وكلمة المرور اللي اخترتها.'
      : 'تم تفعيل حسابك من جديد بنجاح! سجّل الدخول دلوقتي بنفس البريد وكلمة المرور.';
    document.getElementById('pending-screen').style.display='flex';
  }catch(e){
    await undoSession();
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
    try{ await sendEmailVerification(cred.user); }catch(_){}
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

/* ---------- تسجيل خروج تلقائي بعد خمول ---------- */
/* settings.idleLogoutMinutes: 0/فاضي = متوقف (الافتراضي). أي رقم موجب = المدة بالدقايق.
   بيتصفّر مع أي حركة فأرة/لمس/لوحة مفاتيح (قارئ الباركود USB بيبعت keydown فبيتصفّر لوحده)، وكمان يدويًا من وضع الاستقبال مع كل مسح. */
const IdleTimer = {_t:null, _warnT:null, _lastPing:0};
IdleTimer.minutes = function(){ return Number((DB.settings || {}).idleLogoutMinutes) || 0; };
IdleTimer.stop = function(){ clearTimeout(IdleTimer._t); clearTimeout(IdleTimer._warnT); IdleTimer._t = null; IdleTimer._warnT = null; };
IdleTimer.start = function(){
  IdleTimer.stop();
  const mins = IdleTimer.minutes();
  if(!mins || !CURRENT_USER || document.getElementById('app').style.display === 'none') return;
  const ms = mins * 60000;
  if(ms > 60000) IdleTimer._warnT = setTimeout(()=>toast('⏳ هيتم تسجيل خروجك تلقائيًا بعد دقيقة من عدم النشاط'), ms - 60000);
  IdleTimer._t = setTimeout(IdleTimer._trigger, ms);
};
IdleTimer.ping = function(){
  const now = Date.now(); if(now - IdleTimer._lastPing < 2000) return;   // تقليل عدد المرات اللي بيعيد فيها ضبط المؤقّت
  IdleTimer._lastPing = now; IdleTimer.start();
};
IdleTimer._trigger = function(){ signOutWithNotice('تم تسجيل خروجك تلقائيًا بسبب عدم النشاط. سجّل الدخول تاني للمتابعة.'); };
['mousemove','keydown','click','touchstart','scroll'].forEach(evt=>document.addEventListener(evt, IdleTimer.ping, {passive:true}));

App.logout = async function(){
  IdleTimer.stop();
  await log('تسجيل خروج', CURRENT_USER?CURRENT_USER.name:'');
  await signOut(auth);
};
const ROLE_LABELS = {admin:'مدير النظام', servant:'خادم', staff:'مستخدم إداري', superadmin:'مالك النظام', subadmin:'أدمن فرعي'};

/* إتمام الدخول العادي بعد كل الفحوصات (كنيسة نشطة + تأكيد البريد لو مطلوب). بتتنادى من المسار العادي وكمان بعد تأكيد البريد بنجاح (EmailVerify.recheck) من غير ما نعمل تسجيل دخول تاني. */
function finishChurchLogin(){
  hideAllAuthScreens();
  document.getElementById('app').style.display='flex';
  document.getElementById('current-user-name').textContent = CURRENT_USER.name;
  document.getElementById('current-user-role').textContent = ROLE_LABELS[CURRENT_USER.role]||CURRENT_USER.role;
  buildNav();
  updateAttentionBadges();
  DB.users = [CURRENT_USER];
  attachListeners(()=>{ App.navigate(CHURCH_ACCESS_LOCKED ? 'billing' : 'dashboard'); });
  IdleTimer.start();
  maybeShowAnnouncement();
  log('تسجيل دخول', CURRENT_USER.name);
}
/* ---------- بوابة تأكيد البريد الإلكتروني ---------- */
const EmailVerify = {_lastSent:0};
function showEmailVerifyGate(email){
  hideAllAuthScreens();
  if(!document.getElementById('email-verify-screen')){
    document.body.insertAdjacentHTML('beforeend', `
      <div id="email-verify-screen" style="display:flex; min-height:100vh; align-items:center; justify-content:center; flex-direction:column; text-align:center; background:var(--navy); color:#fff; padding:20px;">
        <div style="font-size:52px; margin-bottom:14px;">📩</div>
        <h1 style="font-size:22px; margin:0 0 10px;">أكّد بريدك الإلكتروني</h1>
        <p style="opacity:.85; margin:0 0 6px; max-width:360px;">بعتنالك رابط تأكيد على <b id="ev-email"></b>. افتح بريدك واضغط على الرابط، وبعدين ارجع هنا.</p>
        <p class="login-error" id="ev-error" style="display:none;"></p>
        <div style="display:flex; gap:10px; margin-top:18px; flex-wrap:wrap; justify-content:center;">
          <button class="btn btn-gold" onclick="EmailVerify.recheck()" id="ev-recheck-btn">✅ أكّدت البريد</button>
          <button class="btn btn-ghost" style="border-color:rgba(255,255,255,.4); color:#fff;" onclick="EmailVerify.resend()" id="ev-resend-btn">✉️ إعادة إرسال الرابط</button>
        </div>
        <p class="auth-switch" style="margin-top:22px;"><a onclick="EmailVerify.logout()" style="color:#fff; text-decoration:underline;">تسجيل خروج</a></p>
      </div>`);
  }
  document.getElementById('ev-email').textContent = email || '';
  document.getElementById('email-verify-screen').style.display = 'flex';
}
EmailVerify.recheck = async function(){
  const btn = document.getElementById('ev-recheck-btn'), err = document.getElementById('ev-error');
  err.style.display = 'none'; btn.disabled = true; btn.textContent = 'جاري التأكد...';
  try{
    await auth.currentUser.reload();
    if(auth.currentUser.emailVerified){
      const el = document.getElementById('email-verify-screen'); if(el) el.remove();
      let roleDoc = await getDoc(doc(dbFire,'users', auth.currentUser.uid));
      if(!roleDoc.exists()){ await signOutWithNotice('تم حذف حسابك من النظام أو مش مربوط بأي كنيسة. تواصل مع مسؤول كنيستك.'); return; }
      CURRENT_USER = {uid: auth.currentUser.uid, email: auth.currentUser.email, ...roleDoc.data()};
      finishChurchLogin();
    } else {
      err.textContent = 'لسه ما اتأكدش. افتح بريدك واضغط على الرابط الأول، أو تأكد من مجلد الرسائل غير المرغوب فيها (Spam).';
      err.style.display = 'block';
    }
  }catch(e){ err.textContent = mapAuthError(e); err.style.display = 'block'; }
  finally{ btn.disabled = false; btn.textContent = '✅ أكّدت البريد'; }
};
EmailVerify.resend = async function(){
  const btn = document.getElementById('ev-resend-btn'), err = document.getElementById('ev-error');
  err.style.display = 'none';
  if(Date.now() - EmailVerify._lastSent < 30000){ err.textContent = 'استنى شوية قبل ما تطلب رابط تاني.'; err.style.display = 'block'; return; }
  btn.disabled = true;
  try{ await sendEmailVerification(auth.currentUser); EmailVerify._lastSent = Date.now(); toast('تم إرسال رابط جديد'); }
  catch(e){ err.textContent = mapAuthError(e); err.style.display = 'block'; }
  finally{ btn.disabled = false; }
};
EmailVerify.logout = async function(){ const el = document.getElementById('email-verify-screen'); if(el) el.remove(); await signOut(auth); };

onAuthStateChanged(auth, async (fbUser) => {
  console.log('[AUTH] onAuthStateChanged fired. fbUser =', fbUser ? fbUser.email : null, 'REGISTERING =', REGISTERING);
  if(REGISTERING) { console.log('[AUTH] skipped: REGISTERING flag is true'); return; }
  detachListeners();
  if(!fbUser){
    console.log('[AUTH] no fbUser -> showing login screen');
    CURRENT_USER = null; CURRENT_CHURCH_ID = null; CURRENT_CHURCH = null; CHURCH_ACCESS_LOCKED = false;
    document.getElementById('announcement-bar').style.display = 'none';   // الإعلان لمستخدمين مسجّلين بس، فيتخفي عند الخروج
    document.title = 'نظام إدارة مدارس الأحد';   // نرجّع عنوان التاب الطبيعي (بلا عدّاد تنبيهات) بعد الخروج
    if(Date.now() < HOLD_AUTH_SCREEN_UNTIL){ HOLD_AUTH_SCREEN_UNTIL = 0; return; } // سيب شاشة الرسالة ظاهرة
    if(enforceMaintenanceGate()) return;
    hideAllAuthScreens();
    document.getElementById('login-screen').style.display='flex';
    return;
  }
  try{
    console.log('[AUTH] step 1: fetching users/'+fbUser.uid);
    let roleDoc = await getDoc(doc(dbFire,'users', fbUser.uid));
    console.log('[AUTH] step 1 done. roleDoc.exists =', roleDoc.exists());

    if(!roleDoc.exists()){
      // حساب الدخول (Firebase Auth) موجود لكن مفيش له مستند في النظام: اتحذف من مدير الكنيسة أو مش مربوط بأي كنيسة.
      // (حذف مستخدم من التطبيق بيمسح مستنده بس، وحساب الدخول نفسه بيفضل موجود في Firebase Auth)
      console.log('[AUTH] step 2: no role doc for this account -> access removed notice');
      await signOutWithNotice('تم حذف حسابك من النظام أو مش مربوط بأي كنيسة. تواصل مع مسؤول كنيستك.');
      return;
    }

    let userData = roleDoc.data();
    console.log('[AUTH] step 3: userData =', JSON.stringify(userData));

    CURRENT_USER = {uid: fbUser.uid, email: fbUser.email, ...userData};
    console.log('[AUTH] step 5: CURRENT_USER set. role =', CURRENT_USER.role);

    // بوابة وضع الصيانة: أي حد غير المالك/الأدمن الفرعي يتوقف هنا لو الصيانة مفعّلة
    if(enforceMaintenanceGate()) return;

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
      maybeShowAnnouncement();
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
      maybeShowAnnouncement();
      await saLog('تسجيل دخول (أدمن فرعي)', CURRENT_USER.name);
      return;
    }

    /* ----- باقي الأدوار: لازم تكون مرتبطة بكنيسة نشطة ----- */
    console.log('[AUTH] step 6b: not superadmin, churchId =', CURRENT_USER.churchId);
    if(!CURRENT_USER.churchId){
      await showPendingAndSignOut('لا يوجد لك كنيسة مرتبطة بعد. تواصل مع الإدارة.'); return;
    }
    const churchSnap = await getDoc(doc(dbFire,'churches', CURRENT_USER.churchId));
    if(!churchSnap.exists()){
      await showPendingAndSignOut('كنيستك غير موجودة في النظام. تواصل مع الإدارة.'); return;
    }
    const church = churchSnap.data();
    CURRENT_CHURCH_ID = CURRENT_USER.churchId;
    CURRENT_CHURCH = church;

    if(church.status === 'pending'){
      await showPendingAndSignOut('طلب تسجيل كنيسة "'+church.name+'" لسه قيد المراجعة من الإدارة، وهيتم التواصل معاكم بمجرد الموافقة.'); return;
    }
    if(church.status === 'rejected'){
      await showPendingAndSignOut('للأسف تم رفض طلب تسجيل كنيسة "'+church.name+'". تواصل مع الإدارة لمزيد من التفاصيل.'); return;
    }
    const now = Date.now();
    const trialEnd = church.trialEndsAt ? new Date(church.trialEndsAt).getTime() : 0;
    const activeEnd = church.activeUntil ? new Date(church.activeUntil).getTime() : 0;
    const isExempt = church.status === 'exempt';
    const trialValid = church.status==='trial' && trialEnd > now;
    const activeValid = church.status==='active' && activeEnd > now;
    // بدل ما نقفل الدخول بالكامل، نسمح بالدخول لكن نقفل كل الصفحات ماعدا الفوترة/الدردشة/التذاكر
    CHURCH_ACCESS_LOCKED = !isExempt && !trialValid && !activeValid;

    /* بوابة تأكيد البريد: بس للحسابات اللي اتعملت بعد تفعيل الميزة دي ولسه ماأكدتش بريدها */
    const acctCreated = fbUser.metadata && fbUser.metadata.creationTime ? Date.parse(fbUser.metadata.creationTime) : 0;
    if(!fbUser.emailVerified && acctCreated > EMAIL_VERIFY_CUTOFF_MS){
      showEmailVerifyGate(fbUser.email);
      return;
    }

    /* ----- تمام: دخول عادي للنظام ----- */
    console.log('[AUTH] step 9: normal church login, showing app');
    finishChurchLogin();
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
let SA_CHAT_SESSION = {activeChurchId:null, queue:[]};
let SA_UNREAD_BY_CHURCH = {}; // churchId -> عدد رسائل الكنيسة اللي لسه المالك مقراهاش
let SA_TICKETS = [];
let SA_TICKET_FILTERS = {type:'', status:'', search:'', from:'', to:''};
let SA_PUBLIC_CONFIG = {};
let SA_ADMIN_LINKS = [];
let SA_ACTIVITY_LOG = [];
function monthStartISO(){ const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10); }
let SA_ACTIVITY_FILTERS = {from: monthStartISO(), to:''};
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
  let saChatFirstLoad = true;
  saChatsUnreadUnsub = onSnapshot(query(collection(dbFire,'chatMessages'), where('readBySA','==',false)), snap=>{
    const msgs = snap.docs.map(d=>({id:d.id, ...d.data()}));
    SA_UNREAD_BY_CHURCH = {};
    msgs.forEach(m=>{ SA_UNREAD_BY_CHURCH[m.churchId] = (SA_UNREAD_BY_CHURCH[m.churchId]||0) + 1; });
    const badge = document.getElementById('sa-chats-badge');
    if(badge){ badge.textContent = msgs.length; badge.style.display = msgs.length ? 'inline-block' : 'none'; }
    if(!saChatFirstLoad && msgs.length) notifyUser('💬 رسالة جديدة من كنيسة', msgs[msgs.length-1].text||'مرفق صورة');
    saChatFirstLoad = false;
    if(SA_PAGE==='chats' && !SA_CHAT_CHURCH_ID) SuperAdmin.render();
  }, err=>console.error(err));

  // حالة الجلسة النشطة وطابور الانتظار فى الدردشة
  onSnapshot(doc(dbFire,'platformConfig','chatSession'), d=>{
    SA_CHAT_SESSION = d.exists() ? d.data() : {activeChurchId:null, queue:[]};
    if(SA_PAGE==='chats' && !SA_CHAT_CHURCH_ID) SuperAdmin.render();
  }, err=>console.error(err));

  // أنواع التذاكر المتاحة (يديرها المالك)
  if(saTicketTypesUnsub) saTicketTypesUnsub();
  saTicketTypesUnsub = onSnapshot(doc(dbFire,'ticketTypes','main'), d=>{
    TICKET_TYPES = d.exists() ? (d.data().types||[]) : [];
    if(!TICKET_TYPES.length && !SA_TICKET_TYPES_SEED_ATTEMPTED){
      SA_TICKET_TYPES_SEED_ATTEMPTED = true; // مرة واحدة بس طول الجلسة، عشان مايحصلش تكرار كتابة/فليكر فى الواجهة
      SuperAdmin.seedDefaultTicketTypes();
    }
    if(SA_PAGE==='tickets') SuperAdmin.render();
  }, err=>console.error(err));

  // كل التذاكر عبر كل الكنايس
  if(saTicketsUnsub) saTicketsUnsub();
  let saTicketsFirstLoad = true;
  saTicketsUnsub = onSnapshot(collection(dbFire,'tickets'), snap=>{
    SA_TICKETS = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const unreadTix = SA_TICKETS.filter(t=>t.readBySA===false);
    const badge = document.getElementById('sa-tickets-badge');
    if(badge){ badge.textContent = unreadTix.length; badge.style.display = unreadTix.length ? 'inline-block' : 'none'; }
    if(!saTicketsFirstLoad && unreadTix.length) notifyUser('🎫 تذكرة جديدة', unreadTix[unreadTix.length-1].title||'');
    saTicketsFirstLoad = false;
    if(SA_PAGE==='tickets') SuperAdmin.render();
  }, err=>console.error(err));

  // إعدادات المنصة العامة (رابط تواصل معنا يظهر لأي زائر)
  onSnapshot(doc(dbFire,'platformConfig','public'), d=>{
    SA_PUBLIC_CONFIG = d.exists() ? d.data() : {};
    if(SA_PUBLIC_CONFIG.theme) applyTheme(SA_PUBLIC_CONFIG.theme);
    SuperAdmin.checkBackupReminder();
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
/* نسخة رقمية (ms) من "لحد إمتى الكنيسة تقدر تكتب على بياناتها" — قواعد Firestore بتقارنها بوقت السيرفر
   (تواريخ الاشتراك عندنا نصوص ISO ومش قابلة للمقارنة هناك). لازم تتكتب مع كل تغيير في status/trialEndsAt/activeUntil.
   exempt = مفتوح دائمًا · trial/active = لحد تاريخ الانتهاء · أي حالة تانية = مقفول (0). */
const ACCESS_NEVER_ENDS_MS = 9999999999999;
function accessUntilMsFor(c){
  if(c.status === 'exempt') return ACCESS_NEVER_ENDS_MS;
  const iso = c.status === 'trial' ? c.trialEndsAt : (c.status === 'active' ? c.activeUntil : null);
  if(!iso) return 0;
  const t = new Date(iso).getTime();
  return isNaN(t) ? 0 : t;
}
SuperAdmin.approve = async function(id){
  const trialEndsAt = new Date(Date.now() + TRIAL_DAYS*86400000).toISOString();
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'trial', trialEndsAt, accessUntilMs: accessUntilMsFor({status:'trial', trialEndsAt})});
    await saLog('قبول طلب كنيسة', byId(SA_CHURCHES,id)?.name||id);
    UI.closeModal(); toast('تم قبول الكنيسة وبدء فترة تجربة '+TRIAL_DAYS+' يوم');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.reject = async function(id){
  if(!confirm('تأكيد رفض طلب هذه الكنيسة؟')) return;
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'rejected', accessUntilMs: 0});
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
    await updateDoc(doc(dbFire,'churches',id), {status:'active', activeUntil, accessUntilMs: accessUntilMsFor({status:'active', activeUntil})});
    await saLog('تمديد/تفعيل اشتراك', `${c?.name||id} — ${days} يوم`);
    UI.closeModal(); toast('تم تفعيل/تمديد الاشتراك '+days+' يوم');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
/* مزامنة النسخة الرقمية لكل الكنايس (الكنايس القديمة ماكانتش ليها). الكنيسة pending بتتساب من غير نسخة (لازم تفضل تقدر تتبذّر وقت التسجيل). */
SuperAdmin.syncAccessMirrors = async function(){
  let n = 0;
  for(const c of SA_CHURCHES){
    if(c.status === 'pending') continue;
    const want = accessUntilMsFor(c);
    if(c.accessUntilMs !== want){ await updateDoc(doc(dbFire,'churches',c.id), {accessUntilMs: want}); n++; }
  }
  return n;
};
/* فرض قفل الاشتراك على السيرفر (المالك فقط): لما يتفعّل، أي كنيسة اشتراكها منتهي ماتقدرش تضيف/تعدّل/تحذف بياناتها
   حتى لو تحايلت على الواجهة. الافتراضي متوقف (السلوك زي ما هو). العلَم في platformConfig/public.serverLockEnforced */
SuperAdmin.setServerLock = async function(on){
  if(!CURRENT_USER || CURRENT_USER.role !== 'superadmin'){ toast('الصلاحية دي للمالك فقط'); return; }
  if(on && !confirm('هتفعّل قفل الاشتراك على السيرفر: أي كنيسة اشتراكها منتهي مش هتقدر تضيف أو تعدّل أو تحذف بياناتها. هيتم الأول مزامنة تواريخ كل الكنايس. متابعة؟')) return;
  try{
    let synced = 0;
    if(on) synced = await SuperAdmin.syncAccessMirrors();
    await setDoc(doc(dbFire,'platformConfig','public'), {serverLockEnforced: !!on}, {merge:true});
    await saLog(on ? 'تفعيل قفل الاشتراك على السيرفر' : 'إيقاف قفل الاشتراك على السيرفر', on ? `تمت مزامنة ${synced} كنيسة` : '');
    toast(on ? `تم تفعيل القفل على السيرفر (اتزامنت ${synced} كنيسة)` : 'تم إيقاف القفل على السيرفر');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.syncNow = async function(){
  try{ const n = await SuperAdmin.syncAccessMirrors(); toast(n ? `اتزامنت ${n} كنيسة` : 'كل الكنايس متزامنة بالفعل'); }
  catch(e){ console.error(e); toast('تعذرت المزامنة: '+e.message); }
};
SuperAdmin.exempt = async function(id){
  if(!confirm('هتخلي الكنيسة دي مفتوحة دائمًا بدون اشتراك أو حد زمني. متابعة؟')) return;
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'exempt', accessUntilMs: ACCESS_NEVER_ENDS_MS});
    await saLog('إعفاء دائم', byId(SA_CHURCHES,id)?.name||id);
    UI.closeModal(); toast('تم إعفاء الكنيسة — بقت مفتوحة دائمًا');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.deactivate = async function(id){
  if(!confirm('هل تريد إلغاء تفعيل اشتراك هذه الكنيسة فورًا؟ لن تقدر تدخل النظام إلا بعد ما تفعّل الاشتراك تاني.')) return;
  try{
    const pastIso = new Date(Date.now()-1000).toISOString();
    await updateDoc(doc(dbFire,'churches',id), {status:'active', activeUntil: pastIso, accessUntilMs: accessUntilMsFor({status:'active', activeUntil: pastIso})});
    await saLog('إلغاء تفعيل فوري', byId(SA_CHURCHES,id)?.name||id);
    UI.closeModal(); toast('تم إلغاء تفعيل اشتراك الكنيسة');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.unexempt = async function(id){
  if(!confirm('هترجع الكنيسة دي لنظام الاشتراك العادي (هتتقفل لو مفيش اشتراك ساري). متابعة؟')) return;
  try{
    await updateDoc(doc(dbFire,'churches',id), {status:'expired', activeUntil:null, accessUntilMs: 0});
    await saLog('إلغاء إعفاء', byId(SA_CHURCHES,id)?.name||id);
    UI.closeModal(); toast('تم إلغاء الإعفاء — الكنيسة محتاجة تفعيل اشتراك دلوقتي');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SuperAdmin.deleteChurch = async function(id, name){
  const typed = prompt('حذف الكنيسة "'+name+'" وكل بياناتها (مخدومين، خدام، حضور، مستخدمين... كل حاجة) نهائيًا ومفيش رجوع.\n\nاكتب اسم الكنيسة بالظبط للتأكيد:');
  if(typed !== name){ if(typed!==null) toast('الاسم مش مطابق، اتلغت العملية'); return; }
  try{
    toast('جاري حذف بيانات الكنيسة...');
    const tenantCols = ['members','servants','stages','grades','classes','attendance','evaluations','followups','activities','auditLog','paymentProofs','chatMessages','tickets','invites'];
    for(const col of tenantCols){
      await fsDeleteWhere(col, 'churchId', id);
    }
    const usersSnap = await getDocs(query(collection(dbFire,'users'), where('churchId','==', id)));
    await Promise.all(usersSnap.docs.map(d=>deleteDoc(d.ref)));
    await deleteDoc(doc(dbFire,'settings', id));
    // شيل الكنيسة من جلسة/طابور الدردشة لو كانت فيهم (عشان مايفضلش اسمها معلّق)
    try{
      const csRef = doc(dbFire,'platformConfig','chatSession');
      const cs = await getDoc(csRef);
      if(cs.exists()){
        const d = cs.data();
        const oldQueue = d.queue || [];
        const queue = oldQueue.filter(x=>x!==id);
        const wasActive = d.activeChurchId === id;
        if(wasActive || queue.length !== oldQueue.length){
          const activeChurchId = wasActive ? (queue.shift() || null) : d.activeChurchId;
          await setDoc(csRef, {activeChurchId, queue}, {merge:true});
        }
      }
    }catch(e){ console.warn('chat session cleanup skipped', e); }
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
    await updateDoc(doc(dbFire,'churches',churchId), {status:'active', activeUntil, accessUntilMs: accessUntilMsFor({status:'active', activeUntil})});
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
    const activeChurch = SA_CHAT_SESSION.activeChurchId ? byId(SA_CHURCHES, SA_CHAT_SESSION.activeChurchId) : null;
    const queue = (SA_CHAT_SESSION.queue||[]).map(id=>byId(SA_CHURCHES,id)).filter(Boolean);
    el.innerHTML = `
      <div class="card card-pad" style="margin-bottom:16px;">
        ${activeChurch ? `
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
            <span>🟢 بيتكلم معاك دلوقتي: <b>${esc(activeChurch.name)}</b></span>
            <div>
              <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.openChat('${activeChurch.id}')">فتح المحادثة</button>
              <button class="btn btn-danger btn-sm" onclick="SuperAdmin.endActiveSession()">🔴 إنهاء الجلسة الحالية</button>
            </div>
          </div>
        ` : `<p class="muted" style="margin:0;">مفيش جلسة نشطة دلوقتي — ابدأ محادثة مع أي كنيسة من القائمة تحت.</p>`}
        ${queue.length ? `
          <div style="margin-top:14px; border-top:1px solid var(--line); padding-top:12px;">
            <b style="font-size:13px;">⏳ قائمة الانتظار (${queue.length})</b>
            <div style="margin-top:8px; display:flex; flex-direction:column; gap:6px;">
              ${queue.map((c,i)=>`<div style="display:flex; justify-content:space-between; align-items:center;">
                <span>${i+1}. ${esc(c.name)}</span>
                <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.openChat('${c.id}')">ابدأ المحادثة معاه</button>
              </div>`).join('')}
            </div>
          </div>
        ` : ''}
      </div>
      <div class="section-head"><h2>كل الكنايس</h2></div>
      <div class="info-card-grid">
        ${sorted.length ? sorted.map(c=>{
          const unread = SA_UNREAD_BY_CHURCH[c.id]||0;
          return `<div class="church-card" style="position:relative;" onclick="SuperAdmin.openChat('${c.id}','${esc(c.name)}')">
            <h3>${esc(c.name)}${unread? ` <span class="badge-count" style="display:inline-block; margin-right:6px;">${unread}</span>`:''}${SA_CHAT_SESSION.activeChurchId===c.id?' 🟢':''}</h3>
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
  SuperAdmin.claimActiveSession(churchId);
  if(saChatUnsub) saChatUnsub();
  saChatUnsub = onSnapshot(query(collection(dbFire,'chatMessages'), where('churchId','==',churchId)), snap=>{
    SA_CHAT_MESSAGES = snap.docs.map(d=>({id:d.id, ...d.data()})).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    if(SA_PAGE==='chats' && SA_CHAT_CHURCH_ID===churchId){
      SuperAdmin.renderChatMessages();
      markChatRead(SA_CHAT_MESSAGES.filter(m=>m.senderRole!=='superadmin'), 'readBySA');
      SuperAdmin.purgeOldChatMessages(churchId);
    }
  }, err=>console.error(err));
  SuperAdmin.render();
};
/* حذف فعلي (من الطرفين ومن Firebase) لأي رسالة عدّى عليها 30 يوم — الإدارة هي الوحيدة اللي معاها صلاحية الحذف،
   فالتنضيف بيحصل من هنا لما تفتح محادثة الكنيسة دي (مش عملية مجدولة في الخلفية، لأن مفيش Cloud Functions فى المشروع). */
SuperAdmin._purged = {};
SuperAdmin.purgeOldChatMessages = async function(churchId){
  if(SuperAdmin._purged[churchId] && Date.now() - SuperAdmin._purged[churchId] < 60000) return;   // مرة كل دقيقة كحد أقصى لكل كنيسة
  SuperAdmin._purged[churchId] = Date.now();
  const cutoff = Date.now() - CHAT_RETENTION_MS;
  const old = SA_CHAT_MESSAGES.filter(m=>(m.createdAt||0) < cutoff);
  if(!old.length) return;
  try{ await Promise.all(old.map(m=>deleteDoc(doc(dbFire,'chatMessages',m.id)))); }
  catch(e){ console.error('chat purge failed', e); }
};
/* يخلي كنيسة معينة هي "النشطة" دلوقتي. لو فيه كنيسة نشطة تانية قبل كده، ترجع آخر واحدة
   فى طابور الانتظار من غير ما تتبعتلها رسالة إغلاق (زي ما اتفقنا: التبديل السريع مش إنهاء فعلي). */
SuperAdmin.claimActiveSession = async function(churchId){
  try{
    const ref = doc(dbFire,'platformConfig','chatSession');
    const snap = await getDoc(ref);
    const s = snap.exists() ? snap.data() : {activeChurchId:null, queue:[]};
    if(s.activeChurchId === churchId) return; // بالفعل هي النشطة
    let queue = (s.queue||[]).filter(id=>id!==churchId);
    if(s.activeChurchId && s.activeChurchId!==churchId) queue.push(s.activeChurchId);
    await setDoc(ref, {activeChurchId: churchId, queue}, {merge:true});
  }catch(e){ console.error('claim session failed', e); }
};
/* إنهاء الجلسة الحالية فعليًا: رسالة ختامية للعميل + ترقية أول واحد فى الطابور تلقائيًا */
SuperAdmin.endActiveSession = async function(){
  const activeId = SA_CHAT_SESSION.activeChurchId;
  if(!activeId) return;
  if(!confirm('تأكيد إنهاء الجلسة الحالية؟')) return;
  try{
    await fsAddRaw('chatMessages', {
      churchId: activeId, senderRole:'superadmin', senderName: CURRENT_USER.name,
      text: '✅ تم إنهاء الجلسة الحالية، شكرًا لتواصلك معنا.', createdAt: Date.now(), readBySA:true, readByChurch:false,
    });
    const queue = [...(SA_CHAT_SESSION.queue||[])];
    const next = queue.shift() || null;
    await setDoc(doc(dbFire,'platformConfig','chatSession'), {activeChurchId: next, queue}, {merge:true});
    toast('تم إنهاء الجلسة');
  }catch(e){ console.error(e); toast('تعذر الإنهاء: '+e.message); }
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
let SA_TICKET_TYPES_SEED_ATTEMPTED = false;
SuperAdmin.seedDefaultTicketTypes = async function(){
  if(SA_SEEDING_TICKET_TYPES) return;
  SA_SEEDING_TICKET_TYPES = true;
  try{ await setDoc(doc(dbFire,'ticketTypes','main'), { types: DEFAULT_TICKET_TYPES }, {merge:true}); }
  catch(e){ console.error(e); }
  finally{ SA_SEEDING_TICKET_TYPES = false; }
};
SuperAdmin.renderTickets = function(el){
  const types = TICKET_TYPES;
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
          <select id="tk-f-status"><option value="">الكل</option>${Object.entries(TICKET_STATUS_META).map(([s,m])=>`<option value="${s}" ${SA_TICKET_FILTERS.status===s?'selected':''}>${m.ic} ${s}</option>`).join('')}</select>
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
          ${ticketStatusPill(t.status, t.cancelledByChurch)}
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
  const isCancelledByChurch = !!t.cancelledByChurch;
  UI.openModal(t.ticketNo, `
    ${ticketStatusPill(t.status, isCancelledByChurch)}
    <div class="kv" style="margin-top:14px; margin-bottom:6px;">
      <b>العميل</b><span>${esc(church?church.name:'')}${t.createdByName?' — '+esc(t.createdByName):''}</span>
      <b>النوع</b><span>${esc(t.type||'')}</span>
      <b>التاريخ</b><span>${new Date(t.createdAt).toLocaleString('ar-EG')}</span>
    </div>
    <div style="margin-top:12px;">
      <b style="font-size:13px;">${esc(t.title)}</b>
      <div class="card card-pad" style="margin-top:8px; background:var(--paper);">${esc(t.description)}</div>
    </div>
    ${t.attachmentImg? `<img src="${t.attachmentImg}" style="max-width:160px; border-radius:8px; margin-top:10px; cursor:pointer; border:1px solid var(--line);" onclick="UI.previewImage('${t.attachmentImg.replace(/'/g,"\\'")}')">`:''}
    ${t.hasAdminUpdate? `<div class="card card-pad" style="margin-top:14px; background:var(--present-bg); border-color:#BFE0CD;">
      <b style="font-size:12.5px; color:var(--present);">💬 ردك السابق:</b>
      <p style="font-size:13px; margin-top:6px; white-space:pre-wrap;">${esc(t.adminReply||'')}</p>
    </div>` : ''}
    ${isCancelledByChurch ? `
      <div class="card card-pad" style="margin-top:16px; background:var(--absent-bg); border-color:#E7C6BE;">
        🚫 العميل ألغى التذكرة دي بنفسه — للعرض فقط، مينفعش يتغيّر حالتها أو يتبعتلها رد.
      </div>
    ` : `
      <div class="field" style="margin-top:16px; border-top:1px solid var(--line); padding-top:14px;">
        <label>تغيير الحالة</label>
        <select id="tk-status-update">
          ${Object.entries(TICKET_STATUS_META).filter(([s])=>s!=='ملغاة').map(([s,m])=>`<option value="${s}" ${t.status===s?'selected':''}>${m.ic} ${s}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>الرد على العميل</label><textarea id="tk-reply" rows="3" placeholder="اكتب ردك هنا...">${esc(t.adminReply||'')}</textarea></div>
    `}
  `, isCancelledByChurch
    ? `<button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>`
    : `<button class="btn btn-primary" onclick="SuperAdmin.saveTicketUpdate('${t.id}')">💾 حفظ وإرسال للعميل</button><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>`
  );
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
  const maint = SA_PUBLIC_CONFIG.maintenance || {};
  el.innerHTML = `
    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">🔔 إشعارات المتصفح</b>
      <p class="muted" style="margin:0 0 10px;">هتوصلك إشعار فوري لما تيجي رسالة أو تذكرة من أي كنيسة، حتى لو التاب فى الخلفية.</p>
      <button class="btn btn-primary btn-sm" onclick="enableBrowserNotifications()">${window.Notification && Notification.permission==='granted' ? '✅ الإشعارات مفعّلة' : '🔔 تفعيل الإشعارات'}</button>
    </div>
    <div class="card card-pad" style="margin-bottom:16px; ${maint.enabled?'border-color:#E7C6BE; background:var(--absent-bg);':''}">
      <b style="font-size:13px; display:block; margin-bottom:8px;">🚧 وضع الصيانة (يقفل الموقع مؤقتًا عن كل الكنايس أثناء التطوير)</b>
      <label style="display:flex; align-items:center; gap:8px; font-weight:400; font-size:13px; margin-bottom:10px;">
        <input type="checkbox" id="maint-enabled" ${maint.enabled?'checked':''}> تفعيل وضع الصيانة الآن
      </label>
      <div class="field"><label>موعد الرجوع المتوقع (اختياري)</label><input type="date" id="maint-return" value="${maint.expectedReturn||''}"></div>
      <button class="btn btn-primary btn-sm" onclick="SuperAdmin.saveMaintenance()">حفظ</button>
      <p class="muted" style="margin-top:6px;">إنت (والأدمن الفرعي) هتقدروا تدخلوا عادي من زرار "دخول الأدمن" اللي هيظهر فى شاشة الصيانة.</p>
    </div>

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
SuperAdmin.saveMaintenance = async function(){
  const enabled = document.getElementById('maint-enabled').checked;
  const expectedReturn = document.getElementById('maint-return').value;
  try{
    await setDoc(doc(dbFire,'platformConfig','public'), { maintenance: {enabled, expectedReturn} }, {merge:true});
    await saLog(enabled?'تفعيل وضع الصيانة':'إلغاء وضع الصيانة', expectedReturn||'');
    toast('تم الحفظ');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
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
SuperAdmin.resetActivityFilters = function(){ SA_ACTIVITY_FILTERS = {from: monthStartISO(), to:''}; SuperAdmin.render(); };

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
  const lockOn = !!SA_PUBLIC_CONFIG.serverLockEnforced;
  const unsynced = SA_CHURCHES.filter(c=> c.status !== 'pending' && c.accessUntilMs !== accessUntilMsFor(c)).length;
  const expiredNow = SA_CHURCHES.filter(c=> c.status !== 'pending' && accessUntilMsFor(c) < Date.now()).length;
  const lockCard = (CURRENT_USER && CURRENT_USER.role === 'superadmin') ? `
    <div class="card card-pad" style="margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:6px;">🔒 فرض قفل الاشتراك على السيرفر ${lockOn ? '<span class="pill pill-present">شغّال</span>' : '<span class="pill status-pending">متوقف</span>'}</b>
      <p class="muted" style="margin:0 0 10px;">القفل العادي بيشتغل من الواجهة. لما تفعّل ده، الكنيسة اللي اشتراكها منتهي مش هتقدر تضيف أو تعدّل أو تحذف بياناتها حتى لو تحايلت على الواجهة (الدفع والدردشة والتذاكر تفضل شغالة). التفعيل بيزامن تواريخ كل الكنايس الأول.</p>
      <p style="margin:0 0 12px;">كنايس اشتراكها منتهي حاليًا: <b>${expiredNow}</b> · كنايس محتاجة مزامنة: <b>${unsynced}</b></p>
      <div style="display:flex; gap:8px; flex-wrap:wrap;">
        ${lockOn ? `<button class="btn btn-danger btn-sm" onclick="SuperAdmin.setServerLock(false)">إيقاف الفرض</button>` : `<button class="btn btn-primary btn-sm" onclick="SuperAdmin.setServerLock(true)">تفعيل الفرض</button>`}
        <button class="btn btn-ghost btn-sm" onclick="SuperAdmin.syncNow()">🔄 مزامنة التواريخ الآن</button>
      </div>
    </div>` : '';
  el.innerHTML = `
    ${lockCard}
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

const SA_SEARCH_INDEX = [
  {label:'المظهر وألوان النظام', page:'links', keywords:'ثيم لون شكل تصميم كلاسيكي أزرق نبيتي'},
  {label:'شريط الإعلان المتحرك', page:'links', keywords:'اعلان تنويه شريط اخبار'},
  {label:'قنوات تواصل معنا (واتساب/فيسبوك/انستجرام/تليجرام)', page:'links', keywords:'تواصل واتساب فيسبوك انستجرام تليجرام ايميل تليفون'},
  {label:'وضع الصيانة', page:'links', keywords:'صيانة اغلاق مؤقت تطوير تحديث'},
  {label:'روابط إدارية سريعة', page:'links', keywords:'رابط جيتهاب فايربيز github firebase'},
  {label:'خطط الاشتراك', page:'plans', keywords:'باقة خطة سعر اشتراك'},
  {label:'أكواد الخصم والأيام الإضافية', page:'plans', keywords:'كود خصم كوبون أيام إضافية'},
  {label:'الأدمن الفرعي والصلاحيات', page:'subadmins', keywords:'صلاحية دعوة فرعي مشرف'},
  {label:'مركز اتخاذ القرارات', page:'decisions', keywords:'تنبيه انتهى اشتراك تجربة غير نشطة حذف'},
  {label:'سجل نشاط المالك', page:'activity', keywords:'سجل نشاط حركات'},
  {label:'التقرير الشامل والإحصائيات', page:'report', keywords:'تقرير احصائيات كروت'},
  {label:'أنواع التذاكر والشكاوى', page:'tickets', keywords:'نوع شكوى تذكرة'},
  {label:'مرفقات طرق الدفع', page:'methods', keywords:'مرفق صورة qr رقم حساب'},
];
SuperAdmin.globalSearch = function(q){
  const box = document.getElementById('sa-search-results');
  q = q.trim().toLowerCase();
  if(!q){ box.style.display='none'; return; }
  const pages = [
    {id:'churches',label:'الكنايس'},{id:'requests',label:'طلبات جديدة'},{id:'payments',label:'مراجعة المدفوعات'},
    {id:'methods',label:'طرق الدفع'},{id:'plans',label:'الخطط والعروض'},{id:'report',label:'تقرير شامل'},
    {id:'decisions',label:'مركز اتخاذ القرارات'},{id:'chats',label:'الدردشات'},{id:'tickets',label:'التذاكر'},
    {id:'links',label:'المظهر والروابط'},{id:'activity',label:'سجل النشاط'},{id:'subadmins',label:'الأدمن الفرعي'},
  ];
  const results = [];
  pages.forEach(p=>{ if(p.label.toLowerCase().includes(q)) results.push({label:p.label, sub:'صفحة', action:`SuperAdmin.navigate('${p.id}')`}); });
  SA_SEARCH_INDEX.forEach(it=>{
    if(it.label.toLowerCase().includes(q) || it.keywords.toLowerCase().includes(q))
      results.push({label:it.label, sub:'ميزة/إعداد', action:`SuperAdmin.navigate('${it.page}')`});
  });
  SA_CHURCHES.forEach(c=>{ if((c.name||'').toLowerCase().includes(q)) results.push({label:c.name, sub:'كنيسة', action:`SuperAdmin.navigate('churches'); setTimeout(()=>SuperAdmin.openChurch('${c.id}'),50)`}); });
  SA_TICKETS.forEach(t=>{ if((t.ticketNo||'').toLowerCase().includes(q) || (t.title||'').toLowerCase().includes(q)) results.push({label:t.ticketNo+' — '+t.title, sub:'تذكرة', action:`SuperAdmin.navigate('tickets'); setTimeout(()=>SuperAdmin.openTicketDetail('${t.id}'),50)`}); });
  if(!results.length){ box.innerHTML = '<div class="sr-item muted">لا توجد نتائج</div>'; box.style.display='block'; return; }
  box.innerHTML = results.slice(0,10).map(r=>`<div class="sr-item" onclick="${r.action}">${esc(r.label)}<small>${r.sub}</small></div>`).join('');
  box.style.display = 'block';
};

SuperAdmin.checkBackupReminder = function(){
  const banner = document.getElementById('sa-backup-banner');
  const textEl = document.getElementById('sa-backup-banner-text');
  if(!banner || !textEl) return;
  const last = SA_PUBLIC_CONFIG.lastBackupAt;
  const weekMs = 7*86400000;
  if(!last || (Date.now()-last) > weekMs){
    textEl.textContent = last
      ? `⚠️ آخر نسخة احتياطية كانت من أكتر من أسبوع (${new Date(last).toLocaleDateString('ar-EG')})`
      : `⚠️ لسه ماخدتش أي نسخة احتياطية شاملة للنظام`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
};
SuperAdmin.downloadBackup = async function(){
  try{
    const data = {
      exportedAt: new Date().toISOString(),
      churches: SA_CHURCHES, tickets: SA_TICKETS, paymentProofs: SA_PROOFS,
      paymentMethods: SA_METHODS, plans: SA_PLANS, discountCodes: SA_DISCOUNT_CODES,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'نسخة-احتياطية-'+todayISO()+'.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    await setDoc(doc(dbFire,'platformConfig','public'), {lastBackupAt: Date.now()}, {merge:true});
    await saLog('تنزيل نسخة احتياطية شاملة', '');
    toast('تم تنزيل النسخة الاحتياطية');
  }catch(e){ console.error(e); toast('تعذر التنزيل: '+e.message); }
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
  {id:'followups', label:'المتابعة', ic:'📝', badge:true},
  {id:'activities', label:'الأنشطة', ic:'🎉'},
  {id:'reports', label:'التقارير', ic:'📊', badge:true},
  {id:'billing', label:'الاشتراك والدفع', ic:'💳', badge:true},
  {id:'chat', label:'الدردشة مع الإدارة', ic:'💬', adminOnly:true, badge:true},
  {id:'tickets', label:'الدعم الفني والشكاوى', ic:'🎫', adminOnly:true, badge:true},
  {id:'users', label:'المستخدمون والصلاحيات', ic:'👥', adminOnly:true},
  {id:'settings', label:'الإعدادات', ic:'⚙️', adminOnly:true},
  {id:'backup', label:'النسخ الاحتياطي', ic:'💾', adminOnly:true},
  {id:'trash', label:'سلة المحذوفات', ic:'🗑️', adminOnly:true},
];
let IMPERSONATING = false; // true لما المالك يدخل مؤقتًا للوحة كنيسة معينة
/* صورة صغيرة جنب اسم الكنيسة في القائمة الجانبية (لو الكنيسة رفعتها) — عنصر واحد بيتحدّث بدل ما يتبني كل مرة */
function updateSidebarPhoto(){
  const label = document.getElementById('church-name-label'); if(!label) return;
  let img = document.getElementById('sidebar-church-photo');
  const src = (DB.settings || {}).churchPhoto;
  if(!src){ if(img) img.remove(); return; }
  if(!img){
    img = document.createElement('img'); img.id = 'sidebar-church-photo';
    // نفس عرض أعلى القائمة الجانبية بالكامل (مربّعة)، واسم الكنيسة بيفضل تحتها مباشرة (label جاية بعدها في الـ DOM)
    img.style.cssText = 'width:100%; aspect-ratio:1/1; object-fit:cover; border-radius:12px; display:block; margin:10px 0 8px; cursor:pointer;';
    img.title = 'اضغط لعرض الصورة بالحجم الكامل';
    img.onclick = openChurchPhotoLightbox;
    label.parentNode.insertBefore(img, label);
  }
  if(img.src !== src) img.src = src;
}
/* عرض صورة الكنيسة بحجمها الكامل في نافذة منبثقة — الضغط في أي مكان فاضي (خارج الصورة نفسها) بيقفلها، زي أي مودال تاني في النظام */
function openChurchPhotoLightbox(){
  const src = (DB.settings || {}).churchPhoto; if(!src) return;
  if(document.getElementById('photo-lightbox')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div id="photo-lightbox" onclick="if(event.target===this) closeChurchPhotoLightbox()" style="position:fixed; inset:0; z-index:700; background:rgba(0,0,0,.85); display:flex; align-items:center; justify-content:center; padding:24px; cursor:pointer;">
      <img src="${esc(src)}" style="max-width:92vw; max-height:92vh; object-fit:contain; border-radius:10px; box-shadow:0 10px 40px rgba(0,0,0,.5); cursor:default;">
      <button onclick="closeChurchPhotoLightbox()" title="إغلاق" style="position:fixed; top:16px; left:16px; background:rgba(255,255,255,.15); border:none; color:#fff; width:38px; height:38px; border-radius:50%; font-size:18px; cursor:pointer;">✕</button>
    </div>`);
  document.addEventListener('keydown', _lightboxEscHandler);
}
function _lightboxEscHandler(e){ if(e.key === 'Escape') closeChurchPhotoLightbox(); }
function closeChurchPhotoLightbox(){
  const el = document.getElementById('photo-lightbox'); if(el) el.remove();
  document.removeEventListener('keydown', _lightboxEscHandler);
}
function buildNav(){
  const nav = document.getElementById('nav');
  nav.innerHTML = NAV_ITEMS
    .filter(it=> !it.adminOnly || (CURRENT_USER && (CURRENT_USER.role==='admin' || IMPERSONATING)))
    .map(it=>{
      const locked = CHURCH_ACCESS_LOCKED && !CHURCH_LOCKED_ALLOWED_PAGES.includes(it.id);
      return `<li><a class="nav-a${locked?' nav-locked':''}" data-page="${it.id}" onclick="App.navigate('${it.id}')"><span class="ic">${it.ic}</span>${it.label}${locked?' 🔒':''}${it.badge?` <span class="badge-count" id="nav-badge-${it.id}" style="display:none;">0</span>`:''}</a></li>`;
    }).join('');
  const ub = document.querySelector('#sidebar .user-box');
  if(ub && !document.getElementById('app-version')){
    const d = document.createElement('div'); d.id = 'app-version'; d.className = 'muted';
    d.style.cssText = 'font-size:11px; margin-top:6px; opacity:.7;'; d.textContent = 'الإصدار ' + APP_VERSION;
    ub.appendChild(d);
  }
}
/* تحديث عدد رسائل غير مقروءة (أو أي عدّاد) جنب عنصر في القائمة الجانبية للكنيسة */
/* ---------- مؤشرات التنبيه (badges) في القائمة الجانبية ---------- */
/* بتتحسب من البيانات المحمّلة أصلًا (مفيش استعلام إضافي)، وبتتحدّث تلقائيًا مع أي تغيير لحظي (عبر tick()).
   مهام متابعة متأخرة على "المتابعة"، أيام متبقية على الاشتراك (لو ≤7 أو منتهي) على "الاشتراك والدفع"،
   وعدد ملاحظات فحص جودة البيانات (للمدير بس، زي تلميح لوحة التحكم بالظبط) على "التقارير". */
function updateAttentionBadges(){
  if(!CURRENT_USER || document.getElementById('app').style.display==='none') return;
  const mySv = CURRENT_USER.servantId ? byId(DB.servants, CURRENT_USER.servantId) : null;
  const overdue = (DB.followups||[]).filter(fupIsOverdue).filter(f=> !mySv || f.servantId===mySv.id).length;
  App.updateNavBadge('followups', overdue);

  let billingBadge = 0;
  if(CHURCH_ACCESS_LOCKED){
    billingBadge = 1;
  } else if(CURRENT_CHURCH && (CURRENT_CHURCH.status==='trial' || CURRENT_CHURCH.status==='active')){
    const untilIso = CURRENT_CHURCH.status==='trial' ? CURRENT_CHURCH.trialEndsAt : CURRENT_CHURCH.activeUntil;
    if(untilIso){
      const days = Math.ceil((new Date(untilIso).getTime() - Date.now()) / 86400000);
      if(days <= 7) billingBadge = Math.max(1, days);
    }
  }
  App.updateNavBadge('billing', billingBadge);

  const dqOn = CURRENT_USER.role === 'admin' || IMPERSONATING;
  App.updateNavBadge('reports', (dqOn && (DB.members||[]).length >= 3) ? DataQuality.compute().totalIssues : 0);
}
App.updateNavBadge = function(id, count){
  const el = document.getElementById('nav-badge-'+id);
  if(!el) return;
  el.textContent = count;
  el.style.display = count>0 ? 'inline-block' : 'none';
  updateTabTitleBadge();
};
/* عنوان تبويب المتصفح بيوريك إجمالي كل التنبيهات (المتابعة + الاشتراك + جودة البيانات + الشات + التذاكر) من غير ما تفتح التطبيق أصلًا */
function updateTabTitleBadge(){
  const total = [...document.querySelectorAll('#nav .badge-count')].reduce((n, el)=> n + (el.style.display !== 'none' ? (parseInt(el.textContent, 10) || 0) : 0), 0);
  const base = document.title.replace(/^\(\d+\)\s*/, '');
  document.title = (total > 0 ? `(${total}) ` : '') + base;
}
App.navigate = function(page, param){
  if(CHURCH_ACCESS_LOCKED && !CHURCH_LOCKED_ALLOWED_PAGES.includes(page)){
    toast('انتهى اشتراك الكنيسة — الصفحة دي مش متاحة حاليًا. جدّد الاشتراك من "الاشتراك والدفع".');
    page = 'billing'; param = undefined;
  }
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
    users: Views.users, settings: Views.settings, backup: Views.backup, trash: Views.trash,
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
  const scannerOverlay = document.getElementById('scanner-overlay');
  if(scannerOverlay) scannerOverlay.classList.remove('open');
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
/* ---------- قائمة "ابدأ من هنا" للكنيسة الجديدة ----------
   الخطوات بتتحسب من البيانات الفعلية (مفيش حاجة جديدة بتتخزن)، والكارت بيختفي لوحده لما الأربع خطوات الأساسية يخلصوا،
   أو لما المدير يضغط "إخفاء" (بيتحفظ على المتصفح لكل كنيسة). ظاهر لمدير الكنيسة فقط. */
const ONBOARDING_STEPS = [
  {id:'stages',     ic:'🏫', title:'أضف المراحل والفصول',   desc:'ابدأ بالمراحل (ابتدائي، إعدادي...) وبعدها الفصول جواها.', page:'stages',     done:()=>DB.classes.length>0},
  {id:'members',    ic:'🧒', title:'أضف المخدومين',         desc:'واحد واحد، أو استورد ملف CSV مرة واحدة.',                 page:'members',    done:()=>DB.members.length>0},
  {id:'servants',   ic:'🧑‍🏫', title:'أضف الخدام',             desc:'اكتب بيانات الخدام عشان تبقى متاحة في المتابعة والتقارير.', page:'servants',   done:()=>DB.servants.length>0},
  {id:'attendance', ic:'📝', title:'سجّل أول حضور',         desc:'اختار الفصل وعلّم حاضر/غائب، أو استخدم باركود المخدوم.',   page:'attendance', done:()=>DB.attendance.length>0},
];
const Onboarding = {};
Onboarding.key = ()=> 'onb-dismissed-' + CURRENT_CHURCH_ID;
Onboarding.isDismissed = function(){ try{ return localStorage.getItem(Onboarding.key()) === '1'; }catch(_){ return false; } };
Onboarding.dismiss = function(){ try{ localStorage.setItem(Onboarding.key(), '1'); }catch(_){} App.navigate('dashboard'); };
Onboarding.card = function(){
  if(!CURRENT_USER || !(CURRENT_USER.role === 'admin' || IMPERSONATING)) return '';
  const steps = ONBOARDING_STEPS.map(s=>({...s, isDone: !!s.done()}));
  const doneCount = steps.filter(s=>s.isDone).length;
  if(doneCount === steps.length || Onboarding.isDismissed()) return '';
  const next = steps.find(s=>!s.isDone);
  const pct = Math.round(doneCount / steps.length * 100);
  return `<div class="card card-pad no-print" id="onboarding-card" style="margin-bottom:18px; border-color:var(--gold);">
    <div class="section-head" style="margin-bottom:8px;">
      <h2>🚀 ابدأ من هنا <span class="muted" style="font-size:13px; font-weight:400;">— ${doneCount} من ${steps.length} خطوات</span></h2>
      <button class="btn btn-ghost btn-sm" onclick="Onboarding.dismiss()">إخفاء</button>
    </div>
    <div style="height:8px; background:var(--line); border-radius:99px; overflow:hidden; margin-bottom:14px;"><div style="height:100%; width:${pct}%; background:var(--navy);"></div></div>
    <div style="display:flex; flex-direction:column; gap:8px;">
      ${steps.map(s=>`<div style="display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:10px; ${s.id===next.id ? 'background:var(--gold-soft);' : ''}">
        <span style="font-size:18px;">${s.isDone ? '✅' : s.ic}</span>
        <div style="flex:1;"><div style="font-weight:600; ${s.isDone ? 'text-decoration:line-through; color:var(--ink-soft);' : ''}">${s.title}</div>${s.isDone ? '' : `<div class="muted" style="font-size:12.5px;">${s.desc}</div>`}</div>
        ${s.isDone ? '' : `<button class="btn ${s.id===next.id ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="App.navigate('${s.page}')">${s.id===next.id ? 'ابدأ ←' : 'افتح'}</button>`}
      </div>`).join('')}
    </div>
    <p class="muted" style="margin:12px 0 0; font-size:12.5px;">💡 بعد كده: ادعُ خدامك من "المستخدمون والصلاحيات"، وعدّل رسايل واتساب الجاهزة من "الإعدادات".</p>
  </div>`;
};
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
  const mySv = CURRENT_USER && CURRENT_USER.servantId ? byId(D.servants, CURRENT_USER.servantId) : null;
  const taskScope = mySv ? Followups._dashScope : 'all';
  const allOpenTasks = D.followups.filter(fupIsOpen);
  const openTasks = (taskScope === 'mine' ? allOpenTasks.filter(f=>f.servantId === mySv.id) : allOpenTasks).sort(fupPriorityCompare);
  const upcomingBirthdays = (()=>{
    const now = new Date(); now.setHours(0,0,0,0);
    return activeMembers.filter(m=>m.birthDate).map(m=>{
      const b = new Date(m.birthDate);
      let next = new Date(now.getFullYear(), b.getMonth(), b.getDate());
      if(next < now) next = new Date(now.getFullYear()+1, b.getMonth(), b.getDate());
      const days = Math.round((next-now)/86400000);
      return {...m, nextBirthday: next.toISOString().slice(0,10), daysUntil: days};
    }).filter(m=>m.daysUntil<=7).sort((a,b)=>a.daysUntil-b.daysUntil);
  })();
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate()-30);
  const monthAtt = D.attendance.filter(a=>new Date(a.date)>=monthAgo);
  const monthPresentPct = monthAtt.length ? Math.round(monthAtt.filter(a=>a.present).length/monthAtt.length*100) : 0;

  $content().innerHTML = `
    ${Scope.banner()}
    ${Onboarding.card()}
    ${DataQuality.dashboardHint()}
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
        <div class="section-head"><h2>🎂 أعياد الميلاد القادمة (٧ أيام)</h2></div>
        ${upcomingBirthdays.length ? `<table><tbody>${upcomingBirthdays.map(m=>`
          <tr><td>${esc(m.name)}</td><td class="muted">${m.daysUntil===0?'النهاردة 🎉':fmtDate(m.nextBirthday)}</td>
          <td>${(m.phone||m.guardianPhone)? `<button class="btn btn-ghost btn-sm" title="تهنئة واتساب" onclick="WA.openModal('${m.id}','birthday')">💬</button>` : ''}</td></tr>
        `).join('')}</tbody></table>` : `<p class="muted">مفيش أعياد ميلاد فى الأسبوع الجاي.</p>`}
      </div>
      <div class="card card-pad">
        <div class="section-head"><h2>مخدومون بحاجة إلى متابعة</h2></div>
        ${needFollowup.length? `<table><tbody>${needFollowup.slice(0,6).map(m=>`
          <tr><td class="name-cell"><span class="avatar">${initials(m.name)}</span><span class="nm" onclick="App.navigate('memberProfile','${m.id}')">${esc(m.name)}</span></td>
          <td class="muted">${esc(nameOf(D.classes,m.classId))}</td>
          <td><span class="pill pill-absent">${m.reason}</span></td>
          <td>${(m.phone||m.guardianPhone)? `<button class="btn btn-ghost btn-sm" title="رسالة افتقاد واتساب" onclick="WA.openModal('${m.id}','absence')">💬</button>` : ''}</td></tr>`).join('')}</tbody></table>`
          : `<p class="muted">لا يوجد حاليًا مخدومون بحاجة لمتابعة عاجلة 🎉</p>`}
      </div>
      <div class="card card-pad">
        <div class="section-head"><h2>🗂️ ${taskScope==='mine' ? 'مهامي' : 'متابعات مطلوبة'} (${openTasks.length})</h2><span style="font-size:12.5px;">${mySv ? `<a style="cursor:pointer;" onclick="Followups.setDashScope('${taskScope==='mine'?'all':'mine'}')">${taskScope==='mine' ? `عرض كل المتابعات (${allOpenTasks.length})` : 'مهامي فقط'}</a> · ` : ''}${openTasks.length>6 ? `<a style="cursor:pointer;" onclick="Followups._filter='open'; App.navigate('followups')">عرض الكل</a>` : ''}</span></div>
        ${openTasks.length ? `<table><tbody>${openTasks.slice(0,6).map(f=>{ const m = byId(D.members, f.memberId); return `
          <tr><td class="name-cell"><span class="nm" onclick="App.navigate('memberProfile','${f.memberId}')">${esc(m?m.name:'—')}</span><div class="muted" style="font-size:12px;">${esc(f.type||'')}${f.subject ? ' — '+esc(f.subject) : ''}</div></td>
          <td>${fupStatusPill(f)}</td>
          <td><div class="row-actions"><button class="btn btn-primary btn-sm" title="تمت" onclick="Followups.markDone('${f.id}')">✔</button>${m && (m.phone||m.guardianPhone) ? `<button class="btn btn-ghost btn-sm" title="رسالة واتساب" onclick="WA.openModal('${f.memberId}','${f.type==='غياب'?'absence':'custom'}')">💬</button>` : ''}</div></td></tr>`; }).join('')}</tbody></table>` : `<p class="muted">${taskScope==='mine' ? 'مفيش مهام مسندة ليك 🎉' : 'مفيش متابعات مفتوحة 🎉'}</p>`}
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
        ${opts.extraButtonsHtml||''}
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
Members.toggleSelectAll = function(checked){
  document.querySelectorAll('.member-select').forEach(cb=>{ cb.checked = checked; });
};
Members.printSelectedCards = function(){
  const ids = Array.from(document.querySelectorAll('.member-select:checked')).map(cb=>cb.value);
  if(!ids.length){ toast('حدد مخدوم واحد على الأقل بالخانة اللي جنب كل اسم'); return; }
  const members = ids.map(id=>byId(DB.members,id)).filter(m=>m && m.code);
  const skipped = ids.length - members.length;
  if(!members.length){ toast('المخدومين المحددين لازم يكون عندهم كود مسجّل'); return; }
  printCardsGrid(members);
  if(skipped) toast(`تم تجاهل ${skipped} مخدوم بدون كود مسجّل`);
};
Members.printCard = function(id){
  const m = byId(DB.members, id);
  if(!m) return;
  printPersonCard(m, esc(nameOf(DB.stages,m.stageId))+' — '+esc(nameOf(DB.classes,m.classId)));
};
Members.openLinkSibling = function(memberId){
  UI.openModal('ربط أخ/أخت', `
    <p class="muted" style="margin-bottom:10px;">ابحث عن المخدوم التاني اللي عايز تربطه كأخ/أخت.</p>
    ${memberPickerHtml('f-sibling', '')}
  `, `<button class="btn btn-primary" onclick="Members.saveLinkSibling('${memberId}')">ربط</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Members.saveLinkSibling = async function(memberId){
  const siblingId = document.getElementById('f-sibling').value;
  if(!siblingId){ toast('اختار المخدوم الأول'); return; }
  if(siblingId===memberId){ toast('متقدرش تربط المخدوم بنفسه'); return; }
  try{
    const m = byId(DB.members, memberId);
    const sib = byId(DB.members, siblingId);
    const mSiblings = Array.from(new Set([...(m.siblingIds||[]), siblingId]));
    const sSiblings = Array.from(new Set([...(sib.siblingIds||[]), memberId]));
    await Promise.all([
      updateDoc(doc(dbFire,'members',memberId), {siblingIds: mSiblings}),
      updateDoc(doc(dbFire,'members',siblingId), {siblingIds: sSiblings}),
    ]);
    UI.closeModal(); toast('تم الربط');
    App.navigate('memberProfile', memberId);
  }catch(e){ console.error(e); toast('تعذر الربط: '+e.message); }
};
Members.unlinkSibling = async function(memberId, siblingId){
  if(!confirm('فك الربط بين الاتنين؟')) return;
  try{
    const m = byId(DB.members, memberId);
    const sib = byId(DB.members, siblingId);
    await Promise.all([
      updateDoc(doc(dbFire,'members',memberId), {siblingIds: (m.siblingIds||[]).filter(x=>x!==siblingId)}),
      sib ? updateDoc(doc(dbFire,'members',siblingId), {siblingIds: (sib.siblingIds||[]).filter(x=>x!==memberId)}) : Promise.resolve(),
    ]);
    toast('تم فك الربط');
    App.navigate('memberProfile', memberId);
  }catch(e){ console.error(e); toast('تعذر فك الربط: '+e.message); }
};
Members.printCertificate = function(id){
  const m = byId(DB.members, id);
  if(!m) return;
  const churchName = (DB.settings && DB.settings.churchName) || 'كنيستنا';
  const schoolName = (DB.settings && DB.settings.schoolName) || 'مدرسة الأحد';
  const w = window.open('', '_blank');
  if(!w){ toast('برجاء السماح بفتح نوافذ منبثقة للطباعة'); return; }
  w.document.write(`
    <html dir="rtl"><head><meta charset="utf-8"><title>شهادة — ${esc(m.name)}</title>
    <style>
      body{font-family:'Tahoma',sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; background:#f4f5f2;}
      .cert{width:720px; border:10px double #B08D57; border-radius:6px; padding:50px 60px; text-align:center; background:#fffdfa;}
      .cert .ic{font-size:44px; margin-bottom:10px;}
      .cert h1{color:#2F5D50; font-family:'Georgia',serif; font-size:26px; margin:0 0 6px;}
      .cert .sub{color:#8A5A20; font-size:13px; margin-bottom:28px;}
      .cert .name{font-size:32px; font-weight:800; color:#2F5D50; margin:18px 0; border-bottom:2px solid #B08D57; display:inline-block; padding-bottom:8px;}
      .cert p{font-size:15px; color:#333; line-height:2;}
      .cert .foot{display:flex; justify-content:space-between; margin-top:50px; font-size:12.5px; color:#555;}
      @media print{ body{background:#fff;} }
    </style></head>
    <body>
      <div class="cert">
        <div class="ic">🏆</div>
        <h1>شهادة تقدير</h1>
        <div class="sub">${esc(churchName)} — ${esc(schoolName)}</div>
        <p>تتقدّم إدارة ${esc(schoolName)} بخالص الشكر والتقدير إلى</p>
        <div class="name">${esc(m.name)}</div>
        <p>وذلك تقديرًا لالتزامه وحضوره المميز خلال هذا العام،<br>سائلين الله أن يبارك حياته ويديم عليه نعمة الحضور والخدمة.</p>
        <div class="foot">
          <span>التاريخ: ${esc(fmtDate(todayISO()))}</span>
          <span>توقيع المسؤول: ....................</span>
        </div>
      </div>
      <script>window.onload=function(){ setTimeout(function(){ window.print(); }, 400); };</script>
    </body></html>
  `);
  w.document.close();
};
/* استيراد جماعي من CSV — الأعمدة المتوقعة (بالترتيب): الاسم, الكود, الهاتف, تاريخ الميلاد(YYYY-MM-DD), الجنس, المرحلة, الصف, الفصل
   المرحلة/الصف/الفصل لازم تتطابق بالاسم بالظبط مع الموجود عندك بالفعل، وإلا هيتسجّل المخدوم من غيرهم. */
function parseCsvLine(line){
  const out = []; let cur=''; let inQuotes=false;
  for(let i=0;i<line.length;i++){
    const ch = line[i];
    if(ch==='"'){ inQuotes=!inQuotes; }
    else if(ch===',' && !inQuotes){ out.push(cur); cur=''; }
    else cur+=ch;
  }
  out.push(cur);
  return out.map(s=>s.trim());
}
Members.showImportGuide = function(){
  const stageExamples = DB.stages.slice(0,1).map(s=>s.name).join('، ') || 'ابتدائي';
  UI.openModal('ℹ️ دليل استيراد المخدومين من ملف Excel/CSV', `
    <p style="font-size:13.5px;">أسهل طريقة تضمن الشكل الصحيح: نزّل النموذج الفاضي تحت، افتحه بالإكسل، املا الصفوف، احفظه، وارفعه تاني.</p>
    <button class="btn btn-primary btn-sm" style="margin:10px 0;" onclick="Members.downloadCsvTemplate()">⬇️ تحميل نموذج فارغ (CSV)</button>
    <p style="font-size:13px; margin-top:14px;"><b>ترتيب الأعمدة المطلوب:</b></p>
    <div class="card" style="overflow-x:auto;">
      <table style="font-size:12px; white-space:nowrap;">
        <thead><tr><th>الاسم</th><th>الكود</th><th>الهاتف</th><th>تاريخ الميلاد</th><th>الجنس</th><th>المرحلة</th><th>الصف</th><th>الفصل</th><th>البريد الإلكتروني</th><th>اسم ولي الأمر</th><th>هاتف ولي الأمر</th><th>العنوان</th><th>ملاحظات</th></tr></thead>
        <tbody><tr><td>مريم سمير</td><td>M-101</td><td>01012345678</td><td>2015-03-20</td><td>أنثى</td><td>${esc(stageExamples)}</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td><td>...</td></tr></tbody>
      </table>
    </div>
    <ul style="font-size:12.5px; color:var(--ink-soft); margin-top:12px; padding-inline-start:18px; line-height:1.8;">
      <li>عمود "الاسم" بس إلزامي — الباقي اختياري وتقدر تسيبه فاضي.</li>
      <li>تاريخ الميلاد لازم يكون بالشكل ده بالظبط: سنة-شهر-يوم (مثال: 2015-03-20).</li>
      <li>أعمدة "المرحلة" و"الصف" و"الفصل" لازم تتكتب <b>بنفس الاسم المسجّل عندك بالظبط</b> في النظام، وإلا المخدوم هيتسجّل من غيرهم وتقدر تحدد فصله بعدين يدويًا.</li>
      <li>لو الكود (أو الاسم+الهاتف) بتاع صف موجود بالفعل عندك، النظام <b>هيحدّث بياناته بدل ما يضيفه تاني</b> — يعني تقدر ترفع الملف كذا مرة من غير خوف من التكرار، وربط الإخوة (لو موجود) هيفضل سليم.</li>
      <li>متغيّرش اسم الأعمدة (الصف الأول) في النموذج، وسيبه زي ما هو.</li>
    </ul>
  `, `<button class="btn btn-ghost" onclick="UI.closeModal()">تمام، فهمت</button>`);
};
Members.exportCSV = function(){
  const headers = 'الاسم,الكود,الهاتف,تاريخ الميلاد,الجنس,المرحلة,الصف,الفصل,البريد الإلكتروني,اسم ولي الأمر,هاتف ولي الأمر,العنوان,ملاحظات';
  const rows = DB.members.map(m=>[
    m.name||'', m.code||'', m.phone||'', m.birthDate||'', m.gender||'',
    nameOf(DB.stages,m.stageId)==='—'?'':nameOf(DB.stages,m.stageId),
    nameOf(DB.grades,m.gradeId)==='—'?'':nameOf(DB.grades,m.gradeId),
    nameOf(DB.classes,m.classId)==='—'?'':nameOf(DB.classes,m.classId),
    m.email||'', m.guardianName||'', m.guardianPhone||'', m.address||'', m.notes||'',
  ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  const csv = '\uFEFF'+headers+'\n'+rows.join('\n')+'\n';
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'نسخة-احتياطية-مخدومين-'+todayISO()+'.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};
Members.downloadCsvTemplate = function(){
  const headers = 'الاسم,الكود,الهاتف,تاريخ الميلاد,الجنس,المرحلة,الصف,الفصل,البريد الإلكتروني,اسم ولي الأمر,هاتف ولي الأمر,العنوان,ملاحظات';
  const example = 'مريم سمير,M-101,01012345678,2015-03-20,أنثى,'+(DB.stages[0]?.name||'ابتدائي')+',,,,,,, ';
  const csv = '\uFEFF'+headers+'\n'+example+'\n'; // BOM عشان الإكسل يفتح العربي صح
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'نموذج-استيراد-مخدومين.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};
Members.importCSV = async function(file, inputEl){
  if(!file) return;
  try{
    let text = await file.text();
    if(text.charCodeAt(0)===0xFEFF) text = text.slice(1); // إزالة BOM لو موجود (بيتحط تلقائي من إكسل أو من نموذجنا)
    const lines = text.split(/\r?\n/).filter(l=>l.trim());
    if(!lines.length){ toast('الملف فاضي'); return; }
    // تجاهل السطر الأول لو كان عناوين أعمدة (يحتوي على "اسم" أو "name")
    const startIdx = /اسم|name/i.test(lines[0]) ? 1 : 0;
    const rows = lines.slice(startIdx).map(parseCsvLine).filter(r=>r[0]);
    if(!rows.length){ toast('مفيش صفوف بيانات صالحة فى الملف'); return; }
    if(!confirm(`هيتم معالجة ${rows.length} صف: المخدومين الموجودين بالفعل (بنفس الكود) هيتحدّثوا، والجداد هيتضافوا. متابعة؟`)) return;
    const batch = writeBatch(dbFire);
    let addedCount = 0, updatedCount = 0;
    rows.forEach(r=>{
      const [name, code, phone, birthDate, gender, stageName, gradeName, className, email, guardianName, guardianPhone, address, notes] = r;
      if(!name) return;
      const stage = stageName ? DB.stages.find(s=>s.name===stageName) : null;
      const grade = gradeName ? DB.grades.find(g=>g.name===gradeName && (!stage||g.stageId===stage.id)) : null;
      const cls = className ? DB.classes.find(c=>c.name===className && (!grade||c.gradeId===grade.id)) : null;
      const data = {
        name, code: code||undefined, phone: phone||'', birthDate: birthDate||'',
        gender: gender||'', stageId: stage?stage.id:null, gradeId: grade?grade.id:null, classId: cls?cls.id:null,
        email: email||'', guardianName: guardianName||'', guardianPhone: guardianPhone||'', address: address||'', notes: notes||'',
      };
      // منع التكرار: لو فيه مخدوم بنفس الكود (أو بنفس الاسم+الهاتف لو مفيش كود) بنحدّث بياناته بدل ما نضيف نسخة جديدة
      // — وده كمان بيحافظ على ربط الإخوة لأن المستند الأصلي (ID) مابيتغيرش
      const existing = code ? DB.members.find(m=>m.code===code) : DB.members.find(m=>m.name===name && (!phone||m.phone===phone));
      if(existing){
        batch.update(doc(dbFire,'members',existing.id), data);
        updatedCount++;
      } else {
        const ref = doc(collection(dbFire,'members'));
        batch.set(ref, {...data, code: data.code||('M-'+Date.now().toString().slice(-6)+addedCount), status:'active', churchId: CURRENT_CHURCH_ID, createdAt: Date.now()});
        addedCount++;
      }
    });
    await batch.commit();
    await log('استيراد مخدومين من CSV', `${addedCount} إضافة، ${updatedCount} تحديث`);
    toast(`تم: ${addedCount} مخدوم جديد + ${updatedCount} تحديث`);
    if(inputEl) inputEl.value = '';
  }catch(e){ console.error(e); toast('تعذر الاستيراد: '+e.message); }
};
Views.members = function(){
  listPage({
    title:'المخدومون', addLabel:'إضافة مخدوم', onAdd:'Members.openForm()',
    extraButtonsHtml:`<button class="btn btn-ghost btn-sm" onclick="document.getElementById('members-csv-input').click()">📥 استيراد CSV</button><button class="btn btn-ghost btn-sm" title="دليل الاستخدام" onclick="Members.showImportGuide()">ℹ️ دليل</button><input type="file" id="members-csv-input" accept=".csv" style="display:none;" onchange="Members.importCSV(this.files[0], this)"><button class="btn btn-gold btn-sm" onclick="Members.printSelectedCards()">🎫 طباعة بطاقات مجموعة</button>`,
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
      {h:'<input type="checkbox" onchange="Members.toggleSelectAll(this.checked)" title="تحديد الكل">', render:m=>`<input type="checkbox" class="member-select" value="${m.id}">`},
      {h:'الاسم', render:m=>`<div class="name-cell"><span class="avatar">${m.photo?`<img src="${m.photo}" data-photo="${m.photo}" onclick="previewAvatarClick(event)" style="cursor:zoom-in;">`:initials(m.name)}</span><span class="nm" onclick="App.navigate('memberProfile','${m.id}')">${esc(m.name)}</span></div>`},
      {h:'الكود', key:'code'},
      {h:'الجنس', key:'gender'},
      {h:'المرحلة', render:m=>esc(nameOf(DB.stages,m.stageId))},
      {h:'الصف', render:m=>esc(nameOf(DB.grades,m.gradeId))},
      {h:'الفصل', render:m=>esc(nameOf(DB.classes,m.classId))},
      {h:'الهاتف', key:'phone'},
      {h:'الحالة', render:m=>statusPill(m.status)},
      {h:'', render:m=>`<div class="row-actions">${(m.phone||m.guardianPhone)?`<button class="btn btn-ghost btn-sm" title="رسالة واتساب" onclick="WA.openModal('${m.id}')">💬</button>`:''}<button class="btn btn-ghost btn-sm" onclick="Members.openForm('${m.id}')">تعديل</button><button class="btn btn-danger btn-sm" onclick="Members.remove('${m.id}')">حذف</button></div>`},
    ]
  });
};
Members.openForm = function(id){
  Members._afterSave = null;   // بيتحدد بعد الفتح لو النموذج اتفتح من تقرير (زي فحص جودة البيانات) ونفضل فيه بعد الحفظ
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
  const phone = document.getElementById('f-phone').value.trim();
  // كشف تكرار محتمل: نفس الاسم بالظبط، أو نفس رقم الهاتف (غير فاضي)، فى مخدوم تاني غير اللي بنعدّله دلوقتي
  if(!id){
    const dup = DB.members.find(m=> m.name.trim()===name || (phone && m.phone && m.phone.trim()===phone));
    if(dup && !confirm(`فيه مخدوم مسجّل بالفعل بنفس ${dup.name===name?'الاسم':'رقم الهاتف'}: "${dup.name}"${dup.code?' (كود '+dup.code+')':''}.\nمتأكد إنك عايز تضيف مخدوم جديد تاني؟`)) return;
  }
  const data = {
    name, code:document.getElementById('f-code').value.trim(), birthDate:document.getElementById('f-birth').value,
    photo: document.getElementById('f-photo-data').value,
    gender:document.getElementById('f-gender').value, stageId:document.getElementById('f-stage').value,
    gradeId:document.getElementById('f-grade').value,
    classId:document.getElementById('f-class').value, phone,
    email:document.getElementById('f-email').value.trim(), guardianName:document.getElementById('f-guardian').value.trim(),
    guardianPhone:document.getElementById('f-guardianphone').value.trim(), address:document.getElementById('f-address').value.trim(),
    status:document.getElementById('f-status').value, notes:document.getElementById('f-notes').value.trim(),
  };
  try{
    if(id){ await fsUpdate('members', id, data); await log('تعديل مخدوم', name); }
    else { await fsAdd('members', {...data, createdAt: Date.now()}); await log('إضافة مخدوم', name); }
    UI.closeModal(); toast('تم الحفظ بنجاح');
    { const cb = Members._afterSave; Members._afterSave = null; if(cb){ cb(); return; } }
    App.navigate(CURRENT_PAGE==='memberProfile'?'members':CURRENT_PAGE);
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Members.remove = async function(id){
  const m = byId(DB.members,id);
  if(!confirm(`نقل "${m.name}" لسلة المحذوفات؟ تقدر تسترجعه خلال ٣٠ يوم من "سلة المحذوفات".`)) return;
  try{
    await updateDoc(doc(dbFire,'members',id), {deletedAt: Date.now()});
    await log('نقل مخدوم لسلة المحذوفات', m.name);
    toast('تم النقل لسلة المحذوفات');
    { const cb = Members._afterSave; Members._afterSave = null; if(cb){ cb(); return; } }
    App.navigate('members');
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
        <span class="avatar">${m.photo?`<img src="${m.photo}" data-photo="${m.photo}" onclick="previewAvatarClick(event)" style="cursor:zoom-in;">`:initials(m.name)}</span>
        <div style="flex:1;">
          <h2>${esc(m.name)} <span style="font-size:13px;color:var(--ink-soft);font-weight:500;">#${esc(m.code)}</span></h2>
          <div class="muted">${esc(nameOf(DB.stages,m.stageId))} — ${esc(nameOf(DB.grades,m.gradeId))} — ${esc(nameOf(DB.classes,m.classId))} · ${esc(m.gender||'')} · السن ${age(m.birthDate)} · ${statusPill(m.status)}</div>
        </div>
        <button class="btn btn-ghost btn-sm no-print" onclick="Members.openForm('${m.id}')">تعديل البيانات</button>
        <button class="btn btn-ghost btn-sm no-print" onclick="WA.openModal('${m.id}')">💬 واتساب</button>
        <button class="btn btn-gold btn-sm no-print" onclick="Members.printCard('${m.id}')">🎫 طباعة بطاقة</button>
        <button class="btn btn-ghost btn-sm no-print" onclick="Members.printCertificate('${m.id}')">📜 طباعة شهادة</button>
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
      <div>
        <h3>👨‍👩‍👧‍👦 الإخوة</h3>
        <div id="siblings-box">
          ${(m.siblingIds||[]).length ? (m.siblingIds||[]).map(sid=>{
            const sib = byId(DB.members, sid);
            if(!sib) return '';
            return `<div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid var(--line);">
              <span class="nm" onclick="App.navigate('memberProfile','${sid}')">${esc(sib.name)}</span>
              <a style="cursor:pointer; color:var(--absent); font-size:12px;" onclick="Members.unlinkSibling('${m.id}','${sid}')">✖ فك الربط</a>
            </div>`;
          }).join('') : `<p class="muted">لا يوجد إخوة مربوطين.</p>`}
        </div>
        <button class="btn btn-ghost btn-sm no-print" style="margin-top:10px;" onclick="Members.openLinkSibling('${m.id}')">➕ ربط أخ/أخت</button>
      </div>
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
      (fups.length ? `<table><thead><tr><th>التاريخ</th><th>الحالة</th><th>الخادم</th><th>النوع</th><th>الموضوع</th><th>الإجراء</th><th></th></tr></thead><tbody>
      ${fups.map(f=>`<tr><td>${fmtDate(f.date)}</td><td>${fupStatusPill(f)}</td><td>${esc(nameOf(DB.servants,f.servantId))}</td><td>${esc(f.type)}</td><td>${esc(f.subject)}</td><td>${esc(f.action)}</td>
      <td>${fupIsOpen(f) ? `<button class="btn btn-primary btn-sm" onclick="Followups.markDone('${f.id}')">✔ تمت</button> ` : ''}<button class="btn btn-ghost btn-sm" onclick="Followups.openForm('${f.id}','${m.id}')">تعديل</button></td></tr>`).join('')}
      </tbody></table>` : `<p class="muted">لا توجد متابعات مسجلة.</p>`);
  } else if(CURRENT_MEMBER_TAB==='activities'){
    el.innerHTML = acts.length ? `<table><thead><tr><th>النشاط</th><th>التاريخ</th><th>المكان</th></tr></thead><tbody>
      ${acts.map(a=>`<tr><td>${esc(a.name)}</td><td>${fmtDate(a.date)}</td><td>${esc(a.place||'—')}</td></tr>`).join('')}
    </tbody></table>` : `<p class="muted">لم يشارك بعد في أي نشاط.</p>`;
  }
};

/* ---------- Servants ---------- */
const Servants = {};
Servants.exportCSV = function(){
  const headers = 'الاسم,الكود,الهاتف,الجنس,تاريخ البدء,المرحلة,الصف,الفصل,ملاحظات';
  const rows = DB.servants.map(s=>[
    s.name||'', s.code||'', s.phone||'', s.gender||'', s.startDate||'',
    nameOf(DB.stages,s.stageId)==='—'?'':nameOf(DB.stages,s.stageId),
    nameOf(DB.grades,s.gradeId)==='—'?'':nameOf(DB.grades,s.gradeId),
    nameOf(DB.classes,s.classId)==='—'?'':nameOf(DB.classes,s.classId),
    s.notes||'',
  ].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(','));
  const csv = '\uFEFF'+headers+'\n'+rows.join('\n')+'\n';
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'نسخة-احتياطية-خدام-'+todayISO()+'.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
};
Servants.importCSV = async function(file, inputEl){
  if(!file) return;
  try{
    let text = await file.text();
    if(text.charCodeAt(0)===0xFEFF) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter(l=>l.trim());
    if(!lines.length){ toast('الملف فاضي'); return; }
    const startIdx = /اسم|name/i.test(lines[0]) ? 1 : 0;
    const rows = lines.slice(startIdx).map(parseCsvLine).filter(r=>r[0]);
    if(!rows.length){ toast('مفيش صفوف بيانات صالحة فى الملف'); return; }
    if(!confirm(`هيتم معالجة ${rows.length} صف: الخدام الموجودين بالفعل (بنفس الكود) هيتحدّثوا، والجداد هيتضافوا. متابعة؟`)) return;
    const batch = writeBatch(dbFire);
    let addedCount = 0, updatedCount = 0;
    rows.forEach(r=>{
      const [name, code, phone, gender, startDate, stageName, gradeName, className, notes] = r;
      if(!name) return;
      const stage = stageName ? DB.stages.find(s=>s.name===stageName) : null;
      const grade = gradeName ? DB.grades.find(g=>g.name===gradeName && (!stage||g.stageId===stage.id)) : null;
      const cls = className ? DB.classes.find(c=>c.name===className && (!grade||c.gradeId===grade.id)) : null;
      const data = {
        name, code: code||undefined, phone: phone||'', gender: gender||'', startDate: startDate||'',
        stageId: stage?stage.id:null, gradeId: grade?grade.id:null, classId: cls?cls.id:null, notes: notes||'',
      };
      const existing = code ? DB.servants.find(s=>s.code===code) : DB.servants.find(s=>s.name===name && (!phone||s.phone===phone));
      if(existing){
        batch.update(doc(dbFire,'servants',existing.id), data);
        updatedCount++;
      } else {
        const ref = doc(collection(dbFire,'servants'));
        batch.set(ref, {...data, code: data.code||('S-'+Date.now().toString().slice(-6)+addedCount), status:'active', churchId: CURRENT_CHURCH_ID, createdAt: Date.now()});
        addedCount++;
      }
    });
    await batch.commit();
    await log('استيراد خدام من CSV', `${addedCount} إضافة، ${updatedCount} تحديث`);
    toast(`تم: ${addedCount} خادم جديد + ${updatedCount} تحديث`);
    if(inputEl) inputEl.value = '';
  }catch(e){ console.error(e); toast('تعذر الاستيراد: '+e.message); }
};
Views.servants = function(){
  listPage({
    title:'الخدام', addLabel:'إضافة خادم', onAdd:'Servants.openForm()',
    searchFields:['name','code','phone'],
    rows: ()=>DB.servants,
    columns:[
      {h:'الاسم', render:s=>`<div class="name-cell"><span class="avatar">${s.photo?`<img src="${s.photo}" data-photo="${s.photo}" onclick="previewAvatarClick(event)" style="cursor:zoom-in;">`:initials(s.name)}</span><span class="nm" onclick="Servants.viewProfile('${s.id}')">${esc(s.name)}</span></div>`},
      {h:'الكود', key:'code'},
      {h:'الجنس', key:'gender'},
      {h:'المرحلة', render:s=>esc(nameOf(DB.stages,s.stageId))},
      {h:'الصف', render:s=>esc(nameOf(DB.grades,s.gradeId))},
      {h:'الفصل', render:s=>esc(servantClassIds(s).map(id=>nameOf(DB.classes,id)).join('، ') || '—')},
      {h:'الهاتف', key:'phone'},
      {h:'عدد المخدومين', render:s=>{ const ids = servantClassIds(s), sc = Scope.current(); if(sc && !ids.some(id=>sc.classIds.has(id))) return '—'; return DB.members.filter(m=>ids.includes(m.classId)).length; }},
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
  Servants._afterSave = null;
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
      <div class="field full"><label>فصول إضافية (لو بيخدم أكتر من فصل)</label>
        <div class="checklist" id="f-extra-classes">${DB.classes.map(c=>`<label><input type="checkbox" value="${c.id}" ${(s.extraClassIds||[]).includes(c.id)?'checked':''}> ${esc(nameOf(DB.stages,c.stageId))} — ${esc(c.name)}</label>`).join('') || '<span class="muted">مفيش فصول.</span>'}</div>
      </div>
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
  const phone = document.getElementById('f-phone').value.trim();
  if(!id){
    const dup = DB.servants.find(s=> s.name.trim()===name || (phone && s.phone && s.phone.trim()===phone));
    if(dup && !confirm(`فيه خادم مسجّل بالفعل بنفس ${dup.name===name?'الاسم':'رقم الهاتف'}: "${dup.name}".\nمتأكد إنك عايز تضيف خادم جديد تاني؟`)) return;
  }
  const data = {
    name, code:document.getElementById('f-code').value.trim(), phone,
    photo: document.getElementById('f-photo-data').value,
    gender:document.getElementById('f-gender').value,
    startDate:document.getElementById('f-start').value, stageId:document.getElementById('f-stage').value,
    gradeId:document.getElementById('f-grade').value,
    classId:document.getElementById('f-class').value, status:document.getElementById('f-status').value,
    extraClassIds:[...document.querySelectorAll('#f-extra-classes input:checked')].map(i=>i.value).filter(v=>v && v !== document.getElementById('f-class').value),
    notes:document.getElementById('f-notes').value.trim(),
  };
  try{
    if(id){ await fsUpdate('servants', id, data); await log('تعديل خادم', name); }
    else { await fsAdd('servants', data); await log('إضافة خادم', name); }
    UI.closeModal(); toast('تم الحفظ بنجاح');
    { const cb = Servants._afterSave; Servants._afterSave = null; if(cb){ cb(); return; } }
    App.navigate('servants');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Servants.remove = async function(id){
  const s = byId(DB.servants,id);
  if(!confirm(`نقل "${s.name}" لسلة المحذوفات؟ تقدر تسترجعه خلال ٣٠ يوم.`)) return;
  try{
    await updateDoc(doc(dbFire,'servants',id), {deletedAt: Date.now()});
    await log('نقل خادم لسلة المحذوفات', s.name); App.navigate('servants'); toast('تم النقل لسلة المحذوفات');
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
        <button class="btn btn-primary btn-sm" onclick="Stages.showPromotion()">🎓 الترقية السنوية</button>
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
  if(DB.members.some(m=>m.stageId===id)){ toast('مينفعش تحذف المرحلة دي — فيها مخدومين مسجّلين عليها. نقّلهم لمرحلة تانية الأول.'); return; }
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
  if(DB.members.some(m=>m.gradeId===id)){ toast('مينفعش تحذف الصف ده — فيه مخدومين مسجّلين عليه. نقّلهم لصف تاني الأول.'); return; }
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
  if(DB.members.some(m=>m.classId===id)){ toast('مينفعش تحذف الفصل ده — فيه مخدومين مسجّلين عليه. نقّلهم لفصل تاني الأول.'); return; }
  if(!confirm('حذف الفصل؟')) return;
  try{ await fsDelete('classes', id); await log('حذف فصل', id); App.navigate('stages'); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};
/* قوالب أسماء صفوف دراسية شائعة، تُقترح تلقائيًا حسب اسم المرحلة (بند: ربط تسلسل المراحل بالصفوف) */
/* تحويل رقم هاتف محلي مصري (01xxxxxxxxx) لرابط واتساب دولي صحيح (بيقبل أرقام دولية جاهزة برضو) */
function waLink(phone, message){
  let p = String(phone||'').replace(/[^\d]/g,'');
  if(!p) return '';
  if(p.startsWith('0')) p = '2'+p; // 01012345678 → 201012345678
  else if(!p.startsWith('20') && p.length===10) p = '20'+p; // احتياط لأرقام من غير الصفر الأول
  return 'https://wa.me/'+p+(message? '?text='+encodeURIComponent(message) : '');
}
/* ---------- قوالب رسائل واتساب ----------
   المتغيرات ({الاسم} ...) بتتبدّل تلقائيًا ببيانات المخدوم. {ه} = "ه" للذكر و"ها" للأنثى (عشان الصياغة تطلع سليمة).
   القوالب المعدّلة بتتخزن في settings/{الكنيسة}.waTemplates (ونسخة الإعدادات الاحتياطية بتشملها)، والفاضي = الافتراضي. */
const WA_TEMPLATES = [
  {key:'birthday', ic:'🎂', label:'تهنئة عيد ميلاد', text:'🎂 كل سنة و{الاسم} طيب وبخير! ربنا يبارك في عمر{ه} ويفرّح قلب{ه} دايمًا. من كل خدام {الكنيسة} 🙏'},
  {key:'absence',  ic:'🔎', label:'افتقاد (غياب)', text:'سلام ونعمة 🙏 حابين نطمّن على {الاسم} لأننا لاحظنا غياب{ه} عن {المدرسة}. نتمنى نشوف{ه} قريب، وربنا يحفظ{ه}.'},
  {key:'reminder', ic:'⏰', label:'تذكير بالاجتماع', text:'سلام ونعمة 🙏 تذكير بميعاد {المدرسة} يوم {الأحد_القادم} في {الكنيسة}. مستنيين {الاسم} معانا 💛'},
  {key:'welcome',  ic:'👋', label:'ترحيب بمخدوم جديد', text:'أهلاً وسهلاً بـ{الاسم} في {المدرسة} — {الكنيسة} 🙏 فرحانين بانضمام{ه} لينا، وفصل{ه} هو {الفصل}. ربنا يبارك.'},
  {key:'thanks',   ic:'🌟', label:'شكر وتشجيع', text:'سلام ونعمة 🙏 شكرًا على انتظام {الاسم} في {المدرسة} 🌟 ربنا يبارك في{ه} ويثبّت{ه} في طريق النمو.'},
  {key:'payment',  ic:'💰', label:'تذكير برسوم نشاط', text:'سلام ونعمة 🙏 تذكير بسيط برسوم "{النشاط}": المتبقي على {الاسم} {المبلغ_المتبقي} جنيه. شكرًا ليكم وربنا يبارك 🙏'},
  {key:'custom',   ic:'✏️', label:'رسالة مفتوحة', text:'سلام ونعمة يا {الاسم} 🙏\n'},
];
const WA_PLACEHOLDERS = [
  ['{الاسم}','الاسم الأول'], ['{الاسم_بالكامل}','الاسم بالكامل'], ['{ه}','"ه" للذكر و"ها" للأنثى'],
  ['{الفصل}','الفصل'], ['{الصف}','الصف'], ['{المرحلة}','المرحلة'], ['{الكنيسة}','اسم الكنيسة'], ['{المدرسة}','اسم المدرسة'],
  ['{التاريخ}','تاريخ النهاردة'], ['{الأحد_القادم}','تاريخ الأحد الجاي'], ['{درس_الأحد_القادم}','عنوان درس الأحد الجاي لمرحلة المخدوم (لو متسجّل)'], ['{آية_الأحد_القادم}','آية الأحد الجاي'], ['{النشاط}','اسم النشاط (في رسالة الرسوم)'], ['{المبلغ_المتبقي}','المتبقي على المخدوم (في رسالة الرسوم)'], ['{المبلغ_المطلوب}','رسوم الفرد (في رسالة الرسوم)'], ['{الخادم}','اسمك'],
];
function _waDateLabel(d){ return d.toLocaleDateString('ar-EG',{weekday:'long', day:'numeric', month:'long'}); }
const WA = {_mid:null};
WA.getTemplate = function(key){
  const def = WA_TEMPLATES.find(t=>t.key===key);
  const custom = ((DB.settings && DB.settings.waTemplates) || {})[key];
  return (typeof custom==='string' && custom.trim()) ? custom : (def ? def.text : '');
};
WA.fill = function(text, m, ctx){
  const cls = byId(DB.classes, m.classId), grade = byId(DB.grades, m.gradeId), stage = byId(DB.stages, m.stageId);
  const s = DB.settings || {};
  const full = String(m.name||'').trim();
  const today = new Date();
  const sunday = new Date(); sunday.setDate(sunday.getDate() + ((7 - sunday.getDay()) % 7 || 7));
  const vars = {
    'الاسم': full.split(/\s+/)[0] || full, 'الاسم_بالكامل': full,
    'ه': m.gender==='أنثى' ? 'ها' : 'ه',
    'الفصل': cls?cls.name:'', 'الصف': grade?grade.name:'', 'المرحلة': stage?stage.name:'',
    'الكنيسة': s.churchName || (CURRENT_CHURCH && CURRENT_CHURCH.name) || 'الكنيسة',
    'المدرسة': s.schoolName || 'مدرسة الأحد',
    'التاريخ': _waDateLabel(today), 'الأحد_القادم': _waDateLabel(sunday),
    'درس_الأحد_القادم': (getLesson(localISO(sunday), m.stageId) || {}).title || '', 'آية_الأحد_القادم': (getLesson(localISO(sunday), m.stageId) || {}).verse || '',
    'الخادم': CURRENT_USER ? CURRENT_USER.name : '',
    ...(ctx || {}),
  };
  return String(text||'').replace(/\{([^{}]+)\}/g, (all,k)=>{ k=k.trim(); return Object.prototype.hasOwnProperty.call(vars,k) ? vars[k] : all; });
};
/* أرقام الاستلام المتاحة: المخدوم نفسه ثم ولي الأمر */
WA.recipients = function(m){
  const out = [];
  if(m.phone && String(m.phone).replace(/\D/g,'')) out.push({label:'المخدوم — '+m.phone, phone:m.phone});
  if(m.guardianPhone && String(m.guardianPhone).replace(/\D/g,'')) out.push({label:'ولي الأمر'+(m.guardianName?' ('+m.guardianName+')':'')+' — '+m.guardianPhone, phone:m.guardianPhone});
  return out;
};
WA.openModal = function(memberId, key, opts){
  WA._after = (opts && opts.after) || null;   // دالة اختيارية بتتنادى بعد ما واتساب يتفتح فعلًا
  const m = byId(DB.members, memberId);
  if(!m){ toast('المخدوم مش موجود'); return; }
  WA._mid = memberId;
  const recips = WA.recipients(m);
  if(!recips.length){
    UI.openModal('💬 رسالة واتساب — '+m.name,
      `<p>مفيش رقم هاتف مسجّل للمخدوم ده ولا لولي أمره. أضف الرقم من "تعديل البيانات" وبعدين ارجع.</p>`,
      `<button class="btn btn-primary" onclick="Members.openForm('${m.id}')">تعديل البيانات</button><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>`);
    return;
  }
  const tplKey = WA_TEMPLATES.some(t=>t.key===key) ? key : 'custom';
  UI.openModal('💬 رسالة واتساب — '+m.name, `
    <div class="form-grid">
      <div class="field full"><label>المُرسَل إليه</label><select id="wa-to">${recips.map(r=>`<option value="${esc(r.phone)}">${esc(r.label)}</option>`).join('')}</select></div>
      <div class="field full"><label>نوع الرسالة</label><select id="wa-tpl" onchange="WA.pick(this.value)">${WA_TEMPLATES.map(t=>`<option value="${t.key}" ${t.key===tplKey?'selected':''}>${t.ic} ${esc(t.label)}</option>`).join('')}</select></div>
      <div class="field full"><label>نص الرسالة (تقدر تعدّله قبل الإرسال)</label><textarea id="wa-text" rows="6"></textarea></div>
    </div>
    <p class="muted" style="margin:0;">هيتفتح واتساب برسالة جاهزة، وانت اللي بتضغط "إرسال" هناك.</p>
  `, `<button class="btn btn-primary" onclick="WA.send()">💬 فتح واتساب</button><button class="btn btn-ghost" onclick="WA.copy()">📋 نسخ النص</button><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>`);
  WA.pick(tplKey);
};
WA.pick = function(key){
  const m = byId(DB.members, WA._mid); if(!m) return;
  const ta = document.getElementById('wa-text'); if(!ta) return;
  ta.value = WA.fill(WA.getTemplate(key), m);
};
WA.send = function(){
  const m = byId(DB.members, WA._mid); if(!m) return;
  const phone = document.getElementById('wa-to').value;
  const text = document.getElementById('wa-text').value.trim();
  if(!text){ toast('اكتب نص الرسالة الأول'); return; }
  const url = waLink(phone, text);
  if(!url){ toast('رقم الهاتف غير صالح'); return; }
  const win = window.open(url, '_blank');
  if(!win){ toast('برجاء السماح بفتح نوافذ منبثقة عشان يتفتح واتساب'); return; }
  const tpl = WA_TEMPLATES.find(t=>t.key===document.getElementById('wa-tpl').value);
  log('فتح رسالة واتساب', m.name+' — '+(tpl?tpl.label:''));
  const after = WA._after; WA._after = null;
  UI.closeModal();
  if(after) after(m.id);
};
WA.copy = async function(){
  const ta = document.getElementById('wa-text'); if(!ta) return;
  try{ await navigator.clipboard.writeText(ta.value); toast('تم نسخ النص'); }
  catch(_){ ta.select(); try{ document.execCommand('copy'); toast('تم نسخ النص'); }catch(e){ toast('تعذر النسخ'); } }
};
function normalizeArabic(s){
  return String(s||'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').trim();
}
const STAGE_GRADE_TEMPLATES = [
  {match:/حضان|روض|تمهيد/, grades:['تمهيدي أول','تمهيدي ثاني']},
  {match:/ابتدائ|ابتدايي/, grades:['أولى ابتدائي','تانية ابتدائي','تالتة ابتدائي','رابعة ابتدائي','خامسة ابتدائي','سادسة ابتدائي']},
  {match:/اعداد/, grades:['أولى إعدادي','تانية إعدادي','تالتة إعدادي']},
  {match:/ثانو/, grades:['أولى ثانوي','تانية ثانوي','تالتة ثانوي']},
  {match:/جامع/, grades:['الفرقة الأولى','الفرقة الثانية','الفرقة الثالثة','الفرقة الرابعة']},
  {match:/شباب/, grades:['عام']},
];
Stages.autoFillGrades = async function(stageId){
  const st = byId(DB.stages, stageId);
  if(!st) return;
  const nName = normalizeArabic(st.name);
  const tpl = STAGE_GRADE_TEMPLATES.find(t=>t.match.test(nName));
  if(!tpl){ toast('مفيش قالب صفوف جاهز لاسم المرحلة ده — أضف الصفوف يدويًا من "+ إضافة صف دراسي"'); return; }
  const existingNamesNorm = gradesOfStage(stageId).map(g=>normalizeArabic(g.name));
  const toAdd = tpl.grades.filter(g=>!existingNamesNorm.includes(normalizeArabic(g)));
  if(!toAdd.length){ toast('كل الصفوف الافتراضية لهذه المرحلة مضافة بالفعل'); return; }
  if(!confirm(`هيتم إضافة ${toAdd.length} صف دراسي تلقائيًا:\n${toAdd.join('، ')}\nمتابعة؟`)) return;
  try{
    const batch = writeBatch(dbFire);
    toAdd.forEach((name,i)=>{
      const ref = doc(collection(dbFire,'grades'));
      batch.set(ref, {name, stageId, churchId:CURRENT_CHURCH_ID, order: existingNamesNorm.length+i});
    });
    await batch.commit();
    await log('توليد صفوف تلقائي', st.name);
    App.navigate('stages'); toast('تم توليد الصفوف بنجاح');
  }catch(e){ console.error(e); toast('تعذر التوليد: '+e.message); }
};

/* ---------- الترقية السنوية الجماعية ---------- */
function suggestNextGrade(g){
  const siblings = gradesOfStage(g.stageId); // مرتبة أصلًا حسب order
  const idx = siblings.findIndex(x=>x.id===g.id);
  if(idx>=0 && idx < siblings.length-1) return siblings[idx+1].id;
  // آخر صف فى المرحلة دي → نجرّب أول صف فى المرحلة اللي بعدها فى الترتيب
  const stageIdx = DB.stages.findIndex(s=>s.id===g.stageId);
  for(let i=stageIdx+1; i<DB.stages.length; i++){
    const nextGrades = gradesOfStage(DB.stages[i].id);
    if(nextGrades.length) return nextGrades[0].id;
  }
  return '__graduate__'; // مفيش مرحلة بعدها فى الترتيب
}
function buildPromotionTargetOptions(suggested){
  let html = `<option value="__none__" ${suggested==='__none__'?'selected':''}>— بدون نقل —</option>`;
  DB.stages.forEach(st=>{
    const grades = gradesOfStage(st.id);
    if(!grades.length) return;
    html += `<optgroup label="${esc(st.name)}">`;
    grades.forEach(g=>{ html += `<option value="${g.id}" ${suggested===g.id?'selected':''}>${esc(g.name)}</option>`; });
    html += `</optgroup>`;
  });
  html += `<option value="__graduate__" ${suggested==='__graduate__'?'selected':''}>🎓 تخرّج / إيقاف تفعيل</option>`;
  return html;
}
Stages.showPromotion = function(){
  const gradesWithMembers = DB.grades.map(g=>({
    ...g,
    count: DB.members.filter(m=>m.gradeId===g.id && m.status!=='inactive').length,
    stage: byId(DB.stages, g.stageId),
  })).filter(g=>g.count>0).sort((a,b)=>{
    const sa = DB.stages.findIndex(s=>s.id===a.stageId), sb = DB.stages.findIndex(s=>s.id===b.stageId);
    if(sa!==sb) return sa-sb;
    return (a.order||0)-(b.order||0);
  });
  if(!gradesWithMembers.length){ toast('مفيش صفوف فيها مخدومين حاليًا عشان نرقّيهم'); return; }
  const rowsHtml = gradesWithMembers.map(g=>`
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 0; border-bottom:1px solid var(--line); flex-wrap:wrap;">
      <div><b>${esc(g.stage?g.stage.name:'')} — ${esc(g.name)}</b> <span class="muted">(${g.count} مخدوم)</span></div>
      <select id="promo-${g.id}" style="min-width:220px;">${buildPromotionTargetOptions(suggestNextGrade(g))}</select>
    </div>
  `).join('');
  UI.openModal('🎓 الترقية السنوية', `
    <p class="muted" style="margin-bottom:12px;">راجع وعدّل وجهة كل صف قبل التنفيذ. المخدوم هينتقل لنفس اسم الفصل فى الصف الجديد لو موجود بنفس الاسم، وإلا هيفضل الفصل فاضي وتحدده بعدين يدويًا.</p>
    <div id="promo-rows">${rowsHtml}</div>
  `, `<button class="btn btn-primary" onclick="Stages.previewPromotion()">👁 معاينة قبل التنفيذ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
let PROMOTION_PLAN = null;
Stages.previewPromotion = function(){
  const gradesWithMembers = DB.grades.map(g=>({
    ...g, count: DB.members.filter(m=>m.gradeId===g.id && m.status!=='inactive').length, stage: byId(DB.stages, g.stageId),
  })).filter(g=>g.count>0);
  const plan = gradesWithMembers.map(g=>{
    const sel = document.getElementById('promo-'+g.id);
    return {fromGrade:g, target: sel?sel.value:'__none__'};
  }).filter(p=>p.target!=='__none__');
  if(!plan.length){ toast('مفيش أي نقل محدد — كل الصفوف على "بدون نقل"'); return; }
  const totalAffected = plan.reduce((s,p)=>s+p.fromGrade.count,0);
  const summary = plan.map(p=>{
    const label = p.target==='__graduate__' ? '🎓 تخرّج / إيقاف تفعيل' : (byId(DB.grades,p.target)?.name||'');
    return `<div style="padding:6px 0; border-bottom:1px solid var(--line);">${esc(p.fromGrade.stage?p.fromGrade.stage.name:'')} — ${esc(p.fromGrade.name)} (${p.fromGrade.count} مخدوم) ← <b>${esc(label)}</b></div>`;
  }).join('');
  PROMOTION_PLAN = plan.map(p=>({gradeId:p.fromGrade.id, target:p.target}));
  UI.openModal('معاينة الترقية السنوية', `
    <p style="margin-bottom:10px;">الإجراء ده هيأثر على <b>${totalAffected} مخدوم</b> دفعة واحدة. راجع الخطة كويس قبل ما تأكد.</p>
    ${summary}
    <div class="field" style="margin-top:16px;"><label>اكتب "تأكيد" بالظبط للمتابعة</label><input id="promo-confirm-text" placeholder="تأكيد"></div>
  `, `<button class="btn btn-danger" onclick="Stages.executePromotion()">🎓 تنفيذ الترقية الآن</button><button class="btn btn-ghost" onclick="Stages.showPromotion()">رجوع للتعديل</button>`);
};
Stages.executePromotion = async function(){
  const confirmText = document.getElementById('promo-confirm-text').value.trim();
  if(confirmText!=='تأكيد'){ toast('اكتب "تأكيد" بالظبط للمتابعة'); return; }
  if(!PROMOTION_PLAN || !PROMOTION_PLAN.length) return;
  try{
    // نجمع كل التحديثات المطلوبة، ونقسّمها لدفعات (Firestore بيحدد حد أقصى 500 عملية للدفعة الواحدة)
    const updates = [];
    PROMOTION_PLAN.forEach(p=>{
      const members = DB.members.filter(m=>m.gradeId===p.gradeId && m.status!=='inactive');
      members.forEach(m=>{
        if(p.target==='__graduate__'){
          updates.push({id:m.id, data:{status:'inactive', gradeId:null, classId:null}});
        } else {
          const targetGrade = byId(DB.grades, p.target);
          const currentClass = byId(DB.classes, m.classId);
          const matchClass = currentClass ? DB.classes.find(c=>c.gradeId===p.target && c.name===currentClass.name) : null;
          updates.push({id:m.id, data:{stageId: targetGrade?targetGrade.stageId:null, gradeId:p.target, classId: matchClass?matchClass.id:null}});
        }
      });
    });
    for(let i=0; i<updates.length; i+=450){
      const chunk = updates.slice(i, i+450);
      const batch = writeBatch(dbFire);
      chunk.forEach(u=> batch.update(doc(dbFire,'members',u.id), u.data));
      await batch.commit();
    }
    await log('ترقية سنوية جماعية', updates.length+' مخدوم');
    PROMOTION_PLAN = null;
    UI.closeModal();
    toast(`تمت ترقية ${updates.length} مخدوم بنجاح`);
    App.navigate('stages');
  }catch(e){ console.error(e); toast('تعذر التنفيذ: '+e.message); }
};
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
    <div id="att-lesson" class="no-print">${Attendance.lessonHtml()}</div>
    <div class="card">
      <div class="section-head card-pad" style="margin-bottom:0;">
        <h2 style="font-size:14px;">${fmtDate(date)} — ${esc(nameOf(DB.classes,classId))} (${members.length} مخدوم)</h2>
        <div class="toolbar no-print">
          <button class="btn btn-ghost btn-sm" onclick="Attendance.copyLast()">📋 نسخ حضور آخر مرة</button>
          <button class="btn btn-ghost btn-sm" onclick="Attendance.markAll(true)">تحديد الكل حاضر</button>
          <button class="btn btn-ghost btn-sm" onclick="Attendance.showAbsentees(false)">📲 افتقاد الغائبين</button>
          <button class="btn btn-gold btn-sm" onclick="Reception.open()">🖥️ وضع الاستقبال</button>
          <button class="btn btn-ghost btn-sm" onclick="Attendance.printRoster('${classId}','${date}')">🖨 طباعة كشف الفصل</button>
          <button class="btn btn-primary btn-sm" onclick="Attendance.saveAll()">حفظ الحضور</button>
        </div>
      </div>
      <div id="att-copy-hint" class="muted no-print" style="display:none; padding:0 16px 12px; font-size:12.5px;"></div>
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
    <div id="att-absent-panel" class="no-print"></div>
  `;
  Attendance._contacted = {};
};
Attendance.printRoster = function(classId, date){
  const members = DB.members.filter(m=>m.classId===classId && m.status!=='inactive').sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  const w = window.open('', '_blank');
  if(!w){ toast('برجاء السماح بفتح نوافذ منبثقة للطباعة'); return; }
  w.document.write(`
    <html dir="rtl"><head><meta charset="utf-8"><title>كشف حضور — ${esc(nameOf(DB.classes,classId))}</title>
    <style>
      body{font-family:'Tahoma',sans-serif; padding:24px;}
      h2{color:#2F5D50; margin-bottom:4px;}
      p{color:#555; margin-top:0;}
      table{width:100%; border-collapse:collapse; margin-top:16px;}
      th,td{border:1px solid #ccc; padding:8px 10px; text-align:right; font-size:13px;}
      th{background:#f4f5f2;}
      td.sig{width:160px;}
    </style></head>
    <body>
      ${(DB.settings||{}).churchLogo ? `<img src="${esc(DB.settings.churchLogo)}" style="height:50px; max-width:220px; object-fit:contain; display:block; margin:0 0 8px;">` : ''}
      <h2>كشف حضور — ${esc(nameOf(DB.classes,classId))}</h2>
      <p>المرحلة: ${esc(nameOf(DB.stages, DB.classes.find(c=>c.id===classId)?.stageId))} · التاريخ: ${esc(fmtDate(date))} · العدد: ${members.length}</p>
      <table><thead><tr><th>#</th><th>الاسم</th><th>الكود</th><th class="sig">التوقيع</th></tr></thead>
      <tbody>${members.map((m,i)=>`<tr><td>${i+1}</td><td>${esc(m.name)}</td><td>${esc(m.code||'')}</td><td class="sig"></td></tr>`).join('')}</tbody></table>
      <script>window.onload=function(){ setTimeout(function(){ window.print(); }, 300); };</script>
    </body></html>
  `);
  w.document.close();
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
/* نسخ حضور آخر مرة: بيملا اختيارات (حاضر/غائب) على الشاشة من آخر جلسة متسجّلة لنفس الفصل قبل التاريخ المختار.
   ما بيحفظش حاجة لوحده — المستخدم يراجع ويعدّل وبعدين يضغط "حفظ الحضور". المخدوم الجديد (مالوش سجل سابق) بيفضل زي ما هو. */
Attendance.copyLast = function(){
  const classId = document.getElementById('att-class').value;
  const date = document.getElementById('att-date').value;
  if(!classId || !date) return;
  const earlier = DB.attendance.filter(a=> a.classId===classId && a.date && a.date < date);
  if(!earlier.length){ toast('مفيش حضور متسجّل قبل التاريخ ده للفصل ده'); return; }
  const srcDate = earlier.reduce((mx,a)=> a.date > mx ? a.date : mx, '');
  const alreadySaved = DB.attendance.some(a=> a.classId===classId && a.date===date);
  if(alreadySaved && !confirm('التاريخ ده متسجّل له حضور قبل كده. النسخ هيغيّر الاختيارات الظاهرة على الشاشة (ومش هيتحفظ غير لما تضغط "حفظ الحضور"). متابعة؟')) return;
  const prev = {};
  DB.attendance.forEach(a=>{ if(a.classId===classId && a.date===srcDate) prev[a.memberId] = !!a.present; });
  let copied = 0, fresh = 0;
  document.querySelectorAll('#att-rows tr').forEach(tr=>{
    const mid = tr.dataset.mid;
    if(Object.prototype.hasOwnProperty.call(prev, mid)){
      const radio = tr.querySelector(`input[name="p-${mid}"][value="${prev[mid]?1:0}"]`);
      if(radio){ radio.checked = true; copied++; }
    } else fresh++;
  });
  const hint = document.getElementById('att-copy-hint');
  if(hint){
    hint.textContent = `📋 منسوخ من ${fmtDate(srcDate)} (${copied} مخدوم)` + (fresh ? ` — ${fresh} مخدوم بدون سجل سابق فضلوا زي ما هم` : '') + ' — لسه ماتحفظش: راجع واضغط "حفظ الحضور".';
    hint.style.display = 'block';
  }
  toast(`تم نسخ حضور ${fmtDate(srcDate)} — راجع واضغط "حفظ الحضور"`);
};
/* افتقاد الغائبين: بيعرض اللي معلّم "غائب" على الشاشة مع عدد مرات الغياب المتتالية وزر رسالة واتساب جاهزة (قالب "افتقاد") لكل واحد */
Attendance._contacted = {};
Attendance._autoLog = true;
Attendance.showAbsentees = function(silentIfNone){
  const holder = document.getElementById('att-absent-panel');
  const classSel = document.getElementById('att-class'), dateEl = document.getElementById('att-date');
  if(!holder || !classSel || !dateEl) return;
  const date = dateEl.value;
  const absent = [];
  document.querySelectorAll('#att-rows tr').forEach(tr=>{
    const mid = tr.dataset.mid; const chk = tr.querySelector(`input[name="p-${mid}"]:checked`);
    if(chk && chk.value === '0'){ const m = byId(DB.members, mid); if(m) absent.push(m); }
  });
  if(!absent.length){
    holder.innerHTML = silentIfNone ? '' : `<div class="card card-pad" style="margin-top:14px;"><p class="muted" style="margin:0;">مفيش غايبين على الشاشة دلوقتي 🎉</p></div>`;
    return;
  }
  // عدد مرات الغياب المتتالية = النهاردة + الجلسات السابقة المتتالية اللي كان غايب فيها
  const streakOf = m => {
    const prev = DB.attendance.filter(a=>a.memberId===m.id && a.date && a.date < date).sort((a,b)=> a.date < b.date ? 1 : -1);
    let n = 1; for(const r of prev){ if(r.present) break; n++; } return n;
  };
  const rows = absent.map(m=>({m, streak: streakOf(m), hasPhone: WA.recipients(m).length > 0})).sort((a,b)=> b.streak - a.streak);
  holder.innerHTML = `<div class="card card-pad" style="margin-top:14px;">
    <div class="section-head"><h2 style="font-size:15px;">📲 افتقاد الغائبين (${rows.length})</h2><label class="muted" style="display:flex; gap:6px; align-items:center; cursor:pointer; font-size:12.5px;"><input type="checkbox" ${Attendance._autoLog!==false?'checked':''} onchange="Attendance._autoLog=this.checked"> سجّل متابعة تلقائيًا لما واتساب يتفتح</label></div>
    <table><tbody>${rows.map(r=>`<tr>
      <td>${esc(r.m.name)}</td>
      <td>${r.streak >= 2 ? `<span class="pill pill-absent">غائب ${r.streak} مرات متتالية</span>` : `<span class="pill status-pending">أول غياب</span>`}</td>
      <td>${r.hasPhone ? `<button class="btn btn-ghost btn-sm" data-mid="${r.m.id}" onclick="Attendance.contact('${r.m.id}')">${Attendance._contacted[date+'|'+r.m.id] ? '✓ اتفتحت رسالة' : '💬 افتقاد'}</button>` : `<span class="muted">مفيش رقم هاتف</span>`}
        <button class="btn btn-ghost btn-sm" title="سجّل مهمة متابعة" onclick="Attendance.addTask('${r.m.id}')">📌 مهمة</button></td>
    </tr>`).join('')}</tbody></table></div>`;
};
Attendance.contact = function(mid){
  const date = (document.getElementById('att-date')||{}).value;
  WA.openModal(mid, 'absence', { after: id=>{
    Attendance._contacted[date+'|'+id] = true;
    const btn = document.querySelector(`#att-absent-panel button[data-mid="${id}"]`);
    if(btn) btn.textContent = '✓ اتفتحت رسالة';
    if(Attendance._autoLog !== false){
      Followups.logQuick({memberId:id, type:'غياب', subject:'غياب '+fmtDate(date), action:'فتح رسالة افتقاد على واتساب'}).catch(e=>console.error(e));
    }
  }});
};
/* مهمة متابعة للغايب (موعدها بعد 3 أيام) — بتفتح نموذج المتابعة معبّي، وبعد الحفظ المستخدم يفضل في صفحة الحضور */
Attendance.addTask = function(mid){
  const date = (document.getElementById('att-date')||{}).value || todayISO();
  const due = new Date(Date.now() + 3*86400000).toISOString().slice(0,10);
  Followups.openForm(null, mid, {status:'open', type:'غياب', subject:'غياب '+fmtDate(date), nextDate:due, stay:true});
};
/* ---------- وضع الاستقبال (Reception Kiosk) ----------
   شاشة تسجيل حضور سريعة عند الباب: قارئ باركود USB (يشتغل كلوحة مفاتيح) كوضع افتراضي، مع خيار كاميرا الموبايل.
   بتحترم تقييد الخادم بفصله تلقائيًا لأنها بتدوّر في DB.members المفلترة أصلًا زي Attendance.scanCode بالظبط.
   العنصر بيتبني ديناميكيًا ويتلحق بالـ body (من غير أي تعديل في index.html)، ومفيش تعديل في القواعد أو شكل بيانات الحضور. */
const Reception = {};
Reception._seen = new Set();
Reception._cooldown = {};
Reception._audioCtx = null;
Reception._wakeLock = null;
Reception._raf = null;
Reception._stream = null;
Reception.open = function(){
  if(document.getElementById('reception-overlay')) return;
  stopScannerIfActive(); UI.closeModal();
  Reception._seen = new Set(); Reception._cooldown = {};
  document.body.insertAdjacentHTML('beforeend', `
    <style>
      #reception-overlay{position:fixed; inset:0; z-index:600; background:var(--navy); color:#fff; display:flex; flex-direction:column; direction:rtl;}
      #reception-overlay .rc-top{display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 16px; flex-wrap:wrap; border-bottom:1px solid rgba(255,255,255,.15);}
      #reception-overlay .rc-top input[type=date]{background:rgba(255,255,255,.1); border:1px solid rgba(255,255,255,.3); color:#fff; border-radius:8px; padding:6px 8px;}
      #reception-overlay .rc-count{font-size:15px; font-weight:700;}
      #reception-overlay .rc-close{background:rgba(255,255,255,.12); border:none; color:#fff; width:38px; height:38px; border-radius:50%; font-size:18px; cursor:pointer;}
      #reception-overlay .rc-body{flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:20px; gap:18px; text-align:center;}
      #reception-overlay .rc-hint{opacity:.75; font-size:13px;}
      #reception-overlay #rc-input{width:min(360px,90vw); font-size:22px; text-align:center; padding:14px; border-radius:12px; border:2px solid var(--gold); background:rgba(255,255,255,.08); color:#fff;}
      #reception-overlay #rc-input:focus{outline:none; border-color:#fff;}
      #reception-overlay video{width:min(420px,92vw); border-radius:14px; background:#000;}
      #reception-overlay .rc-card{width:min(420px,92vw); border-radius:18px; padding:22px; background:rgba(255,255,255,.06); border:2px solid rgba(255,255,255,.15); min-height:150px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px; transition:border-color .2s, background .2s;}
      #reception-overlay .rc-card.ok{border-color:var(--present); background:rgba(60,150,90,.18);}
      #reception-overlay .rc-card.info{border-color:#8ab4e8; background:rgba(80,120,190,.18);}
      #reception-overlay .rc-card.err{border-color:var(--absent); background:rgba(190,70,70,.18);}
      #reception-overlay .rc-avatar{width:64px; height:64px; border-radius:50%; overflow:hidden; background:rgba(255,255,255,.15); display:flex; align-items:center; justify-content:center; font-size:26px; font-weight:700;}
      #reception-overlay .rc-avatar img{width:100%; height:100%; object-fit:cover;}
      #reception-overlay .rc-name{font-size:24px; font-weight:800;}
      #reception-overlay .rc-sub{opacity:.85; font-size:14px;}
      #reception-overlay .rc-status{font-size:15px; font-weight:700;}
      #reception-overlay .rc-tabs{display:flex; gap:8px;}
      #reception-overlay .rc-tab{padding:6px 14px; border-radius:99px; border:1px solid rgba(255,255,255,.3); background:transparent; color:#fff; cursor:pointer; font-size:13px;}
      #reception-overlay .rc-tab.active{background:var(--gold); border-color:var(--gold); color:#1a1a1a; font-weight:700;}
    </style>
    <div id="reception-overlay">
      <div class="rc-top">
        <button class="rc-close" onclick="Reception.close()" title="إغلاق">✕</button>
        <div class="rc-tabs"><button class="rc-tab active" id="rc-tab-manual" onclick="Reception.setMode('manual')">⌨️ قارئ باركود</button><button class="rc-tab" id="rc-tab-camera" onclick="Reception.setMode('camera')">📷 كاميرا الموبايل</button></div>
        <div style="display:flex; align-items:center; gap:8px;"><input type="date" id="rc-date" value="${todayISO()}"><span class="rc-count">✅ <span id="rc-count-num">0</span> اتسجّلوا</span></div>
      </div>
      <div class="rc-body">
        <div id="rc-cam-wrap" style="display:none;"><video id="rc-video" playsinline muted autoplay></video><canvas id="rc-canvas" style="display:none;"></canvas></div>
        <input type="text" id="rc-input" placeholder="امسح الكود..." autocomplete="off">
        <p class="rc-hint" id="rc-hint">وجّه القارئ نحو كود المخدوم — الخانة هتفضل جاهزة تلقائيًا</p>
        <div class="rc-card" id="rc-card">
          <div class="rc-avatar" id="rc-avatar">🎫</div>
          <div class="rc-name" id="rc-name">جاهز لاستقبال أول مخدوم</div>
          <div class="rc-sub" id="rc-sub"></div>
          <div class="rc-status" id="rc-status"></div>
        </div>
      </div>
    </div>`);
  const input = document.getElementById('rc-input');
  input.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); Reception._submit(input.value); } });
  document.addEventListener('keydown', Reception._onEsc);
  Reception._refocus();
  Reception._blurTimer = setInterval(Reception._refocus, 700);   // يرجّع التركيز للخانة لو المستخدم دبّس في حتة تانية بالغلط
  if(navigator.wakeLock){ navigator.wakeLock.request('screen').then(l=>Reception._wakeLock = l).catch(()=>{}); }
};
Reception._onEsc = function(e){ if(e.key === 'Escape') Reception.close(); };
Reception._refocus = function(){
  const input = document.getElementById('rc-input');
  if(input && Reception._mode !== 'camera' && document.activeElement !== input) input.focus();
};
Reception.close = function(){
  clearInterval(Reception._blurTimer);
  document.removeEventListener('keydown', Reception._onEsc);
  Reception._stopCamera();
  if(Reception._wakeLock){ Reception._wakeLock.release().catch(()=>{}); Reception._wakeLock = null; }
  const el = document.getElementById('reception-overlay'); if(el) el.remove();
};
Reception.setMode = function(mode){
  Reception._mode = mode;
  document.getElementById('rc-tab-manual').classList.toggle('active', mode === 'manual');
  document.getElementById('rc-tab-camera').classList.toggle('active', mode === 'camera');
  document.getElementById('rc-cam-wrap').style.display = mode === 'camera' ? 'block' : 'none';
  document.getElementById('rc-input').style.display = mode === 'camera' ? 'none' : 'block';
  document.getElementById('rc-hint').textContent = mode === 'camera' ? 'وجّه الكاميرا نحو كود المخدوم' : 'وجّه القارئ نحو كود المخدوم — الخانة هتفضل جاهزة تلقائيًا';
  if(mode === 'camera') Reception._startCamera(); else Reception._stopCamera();
  if(mode === 'manual') Reception._refocus();
};
Reception._startCamera = async function(){
  if(!window.jsQR){ document.getElementById('rc-hint').textContent = 'تعذر تحميل مكتبة قراءة الأكواد — تأكد من اتصال الإنترنت'; return; }
  try{
    const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
    if(Reception._mode !== 'camera' || !document.getElementById('reception-overlay')){ stream.getTracks().forEach(t=>t.stop()); return; }
    Reception._stream = stream;
    const video = document.getElementById('rc-video'); video.srcObject = stream; await video.play();
    Reception._camTick();
  }catch(e){ document.getElementById('rc-hint').textContent = 'تعذر تشغيل الكاميرا: ' + e.message; }
};
Reception._stopCamera = function(){
  if(Reception._raf) cancelAnimationFrame(Reception._raf); Reception._raf = null;
  if(Reception._stream) Reception._stream.getTracks().forEach(t=>t.stop()); Reception._stream = null;
};
Reception._camTick = function(){
  if(Reception._mode !== 'camera' || !document.getElementById('reception-overlay')) return;
  const video = document.getElementById('rc-video'), canvas = document.getElementById('rc-canvas');
  if(!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA){ Reception._raf = requestAnimationFrame(Reception._camTick); return; }
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(img.data, img.width, img.height);
  if(code && code.data) Reception._submit(code.data);
  Reception._raf = requestAnimationFrame(Reception._camTick);
};
Reception._submit = async function(raw){
  IdleTimer.ping();
  const val = (raw || '').trim(); if(!val) return;
  const now = Date.now();
  if(Reception._cooldown[val] && now - Reception._cooldown[val] < 3000) { Reception._clearInput(); return; }   // نفس الكود في آخر 3 ثواني = تجاهل (مسح مزدوج)
  Reception._cooldown[val] = now;
  await Reception._handle(val);
  Reception._clearInput();
};
Reception._clearInput = function(){ const i = document.getElementById('rc-input'); if(i) i.value = ''; };
Reception._paint = function(status, member, msg){
  const card = document.getElementById('rc-card'); if(!card) return;
  card.className = 'rc-card ' + status;
  document.getElementById('rc-avatar').innerHTML = member ? (member.photo ? `<img src="${member.photo}">` : esc(initials(member.name))) : (status === 'err' ? '⚠️' : '🎫');
  document.getElementById('rc-name').textContent = member ? member.name : (status === 'err' ? 'كود غير معروف' : 'جاهز لاستقبال أول مخدوم');
  document.getElementById('rc-sub').textContent = member ? nameOf(DB.classes, member.classId) : (msg && status === 'err' ? '' : '');
  document.getElementById('rc-status').textContent = msg || '';
};
Reception._handle = async function(code){
  const member = DB.members.find(m=>(m.code||'').trim() === code);
  if(!member){ Reception._paint('err', null, '⚠️ الكود مش موجود: ' + code); Reception._beep(false); return; }
  if(member.status === 'inactive'){ Reception._paint('err', member, '🚫 المخدوم غير نشط'); Reception._beep(false); return; }
  if(!member.classId){ Reception._paint('err', member, '🚫 لسه مش متسجّل في فصل'); Reception._beep(false); return; }
  const date = document.getElementById('rc-date').value || todayISO();
  const already = DB.attendance.find(a=>a.date === date && a.memberId === member.id && a.classId === member.classId && a.present);
  Reception._seen.add(member.id);
  document.getElementById('rc-count-num').textContent = Reception._seen.size;
  if(already){ Reception._paint('info', member, 'ℹ️ كان مسجّل حاضر بالفعل'); Reception._beep(true); return; }
  try{
    const rec = DB.attendance.find(a=>a.date === date && a.memberId === member.id && a.classId === member.classId);
    if(rec) await fsUpdate('attendance', rec.id, {present:true}); else await fsAdd('attendance', {date, classId:member.classId, memberId:member.id, present:true});
    Reception._paint('ok', member, '✅ تم تسجيل الحضور');
    Reception._beep(true);
    await log('تسجيل حضور — وضع الاستقبال', member.name);
  }catch(e){ console.error(e); Reception._paint('err', member, '⚠️ تعذر الحفظ: ' + e.message); Reception._beep(false); }
};
/* صفارة قصيرة بـ Web Audio (من غير أي ملف صوت خارجي): نغمة صاعدة للنجاح، نغمة منخفضة للخطأ */
Reception._beep = function(ok){
  try{
    if(!Reception._audioCtx) Reception._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = Reception._audioCtx, o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220; o.type = 'sine';
    g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (ok ? 0.18 : 0.3));
    o.start(); o.stop(ctx.currentTime + (ok ? 0.2 : 0.32));
  }catch(_){}
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
    Attendance.showAbsentees(true);   // لو فيه غايبين اعرضهم مع زر الافتقاد
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
/* المتابعة كمهام: كل سجل متابعة ممكن يبقى "مفتوح" (status:'open' + موعد استحقاق في nextDate) أو "تم".
   السجلات القديمة اللي مالهاش status بتتعامل كـ "تم" (سجل اتعمل خلاص) عشان مايظهرش كومة مهام متأخرة من الماضي. */
function fupIsOpen(f){ return !!f && f.status === 'open'; }
function fupDaysToDue(f){ return f && f.nextDate ? Math.round((Date.parse(f.nextDate) - Date.parse(todayISO())) / 86400000) : null; }
function fupIsOverdue(f){ const d = fupDaysToDue(f); return fupIsOpen(f) && d !== null && d < 0; }
function fupStatusPill(f){
  if(!fupIsOpen(f)) return '<span class="pill pill-present">تمت</span>';
  const d = fupDaysToDue(f), soft = 'background:var(--gold-soft);';
  if(d === null) return `<span class="pill" style="${soft}">مفتوحة</span>`;
  if(d < 0) return `<span class="pill pill-absent">متأخرة ${-d} يوم</span>`;
  if(d === 0) return `<span class="pill" style="${soft}">النهاردة</span>`;
  return `<span class="pill" style="${soft}">بعد ${d} يوم</span>`;
}
/* ترتيب المهام: المتأخرة (الأقدم موعدًا أولًا) ← اللي ليها موعد (الأقرب أولًا) ← اللي من غير موعد */
function fupPriorityCompare(a, b){
  const rank = f => { const d = fupDaysToDue(f); return d === null ? 2 : (d < 0 ? 0 : 1); };
  return rank(a) - rank(b) || String(a.nextDate||'').localeCompare(String(b.nextDate||'')) || String(a.date||'').localeCompare(String(b.date||''));
}
const Followups = {_filter:'', _stay:false, _dashScope:'mine'};
Followups.setDashScope = function(v){ Followups._dashScope = v; App.navigate('dashboard'); };
function mySvId(){ return (CURRENT_USER && CURRENT_USER.servantId && byId(DB.servants, CURRENT_USER.servantId)) ? CURRENT_USER.servantId : ''; }
Views.followups = function(){
  const openCount = DB.followups.filter(fupIsOpen).length, overdueCount = DB.followups.filter(fupIsOverdue).length;
  const sel = v => Followups._filter === v ? 'selected' : '';
  listPage({
    title:'المتابعة الفردية', addLabel:'متابعة جديدة', onAdd:'Followups.openForm()',
    searchFields:[],
    filtersHtml:`<select id="fu-status" onchange="_lpRender()"><option value="">كل الحالات</option><option value="open" ${sel('open')}>مفتوحة (${openCount})</option><option value="overdue" ${sel('overdue')}>متأخرة (${overdueCount})</option><option value="done" ${sel('done')}>تمت</option>${mySvId() ? `<option value="mine" ${sel('mine')}>مهامي (مفتوحة)</option>` : ''}</select>`,
    extraButtonsHtml:`<button class="btn btn-primary btn-sm" onclick="Followups.openForm(null,null,{status:'open'})">+ مهمة متابعة</button>`,
    rows:()=>{
      const el = document.getElementById('fu-status');
      Followups._filter = el ? el.value : Followups._filter;
      let list = DB.followups.map(f=>({...f, memberName:nameOf(DB.members,f.memberId), servantName:nameOf(DB.servants,f.servantId)}));
      if(Followups._filter === 'open') list = list.filter(fupIsOpen);
      else if(Followups._filter === 'overdue') list = list.filter(fupIsOverdue);
      else if(Followups._filter === 'done') list = list.filter(f=>!fupIsOpen(f));
      else if(Followups._filter === 'mine') list = list.filter(f=>fupIsOpen(f) && f.servantId === mySvId());
      const opens = list.filter(fupIsOpen).sort(fupPriorityCompare);
      const dones = list.filter(f=>!fupIsOpen(f)).sort((a,b)=>new Date(b.date)-new Date(a.date));
      return [...opens, ...dones];
    },
    columns:[
      {h:'المخدوم', key:'memberName'}, {h:'الحالة', render:fupStatusPill}, {h:'التاريخ', render:f=>fmtDate(f.date)}, {h:'الموعد', render:f=>f.nextDate ? fmtDate(f.nextDate) : '—'},
      {h:'الخادم', key:'servantName'}, {h:'النوع', key:'type'}, {h:'الموضوع', key:'subject'},
      {h:'', render:f=>`<div class="row-actions">${fupIsOpen(f) ? `<button class="btn btn-primary btn-sm" onclick="Followups.markDone('${f.id}')">✔ تمت</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="Followups.openForm('${f.id}','${f.memberId}')">تعديل</button><button class="btn btn-danger btn-sm" onclick="Followups.remove('${f.id}')">حذف</button></div>`}
    ]
  });
};
Followups.openForm = function(id, memberId, pre){
  Followups._stay = !!(pre && pre.stay);   // لو اتفتح من صفحة تانية (زي لوحة الغائبين) مانرجّعش المستخدم لصفحة المتابعة بعد الحفظ
  const f = id ? byId(DB.followups,id) : {...(pre||{})};
  const followupTypeOptions = [...new Set(['غياب','سلوكي','روحي','دراسي','أسري','أخرى', ...(DB.settings.followupTypes||[])])];
  UI.openModal(id?'تعديل متابعة':(fupIsOpen(f)?'مهمة متابعة جديدة':'متابعة جديدة'), `
    <div class="form-grid">
      ${memberId? `<div class="field"><label>المخدوم</label><input value="${esc(nameOf(DB.members,memberId))}" disabled></div>` : memberPickerHtml('f-member', f.memberId)}
      <div class="field"><label>التاريخ</label><input type="date" id="f-date" value="${f.date||todayISO()}"></div>
      <div class="field"><label>الحالة</label><select id="f-status"><option value="done" ${!fupIsOpen(f)?'selected':''}>✅ تمت (سجل اتعمل)</option><option value="open" ${fupIsOpen(f)?'selected':''}>⏳ مفتوحة (مهمة لسه مطلوبة)</option></select></div>
      <div class="field"><label>الخادم المسؤول</label><select id="f-servant">${selectOptions(DB.servants, f.servantId !== undefined ? f.servantId : mySvId())}</select></div>
      <div class="field"><label>نوع المتابعة</label><select id="f-type">
        ${followupTypeOptions.map(t=>`<option ${f.type===t?'selected':''}>${esc(t)}</option>`).join('')}
      </select></div>
      <div class="field full"><label>موضوع المتابعة</label><input id="f-subject" value="${esc(f.subject||'')}"></div>
      <div class="field full"><label>الملاحظات</label><textarea id="f-notes" rows="2">${esc(f.notes||'')}</textarea></div>
      <div class="field full"><label>الإجراء الذي تم اتخاذه</label><textarea id="f-action" rows="2">${esc(f.action||'')}</textarea></div>
      <div class="field"><label>موعد المتابعة / الاستحقاق (اختياري)</label><input type="date" id="f-next" value="${f.nextDate||''}"></div>
    </div>
  `, `<button class="btn btn-primary" onclick="Followups.save('${id||''}','${memberId||''}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Followups.save = async function(id, fixedMemberId){
  const memberId = fixedMemberId || document.getElementById('f-member').value;
  if(!memberId) return toast('اختر المخدوم');
  const status = document.getElementById('f-status').value === 'open' ? 'open' : 'done';
  const prev = id ? byId(DB.followups,id) : null;
  const data = {
    memberId, date:document.getElementById('f-date').value, servantId:document.getElementById('f-servant').value,
    type:document.getElementById('f-type').value, subject:document.getElementById('f-subject').value.trim(),
    notes:document.getElementById('f-notes').value.trim(), action:document.getElementById('f-action').value.trim(),
    nextDate:document.getElementById('f-next').value,
    status, doneAt: status === 'done' ? ((prev && fupIsOpen(prev)) ? todayISO() : ((prev && prev.doneAt) || '')) : '',
  };
  try{
    if(id){ await fsUpdate('followups', id, data); await log('تعديل متابعة', nameOf(DB.members,memberId)); }
    else { await fsAdd('followups', data); await log(status==='open' ? 'إضافة مهمة متابعة' : 'إضافة متابعة', nameOf(DB.members,memberId)); }
    UI.closeModal(); toast('تم الحفظ بنجاح');
    if(Followups._stay){ Followups._stay = false; return; }
    App.navigate(fixedMemberId?'memberProfile':'followups', fixedMemberId||undefined);
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
Followups.markDone = async function(id){
  const f = byId(DB.followups,id); if(!f) return;
  try{
    await fsUpdate('followups', id, {status:'done', doneAt: todayISO()});
    await log('إنجاز متابعة', nameOf(DB.members,f.memberId));
    toast('✔ تم تعليم المتابعة كمنجزة');
  }catch(e){ console.error(e); toast('تعذر التحديث: '+e.message); }
};
/* تسجيل متابعة "تمت" بسرعة (بيتستخدم من لوحة افتقاد الغائبين لما واتساب يتفتح). مابيكررش نفس السجل في نفس اليوم. */
Followups.logQuick = async function(o){
  const date = todayISO();
  if(DB.followups.some(f=>f.memberId===o.memberId && f.date===date && f.type===o.type && f.action===o.action)) return false;
  await fsAdd('followups', {memberId:o.memberId, date, servantId:'', type:o.type, subject:o.subject||'', notes:'', action:o.action||'', nextDate:'', status:'done', doneAt:date, auto:true});
  await log('إضافة متابعة', nameOf(DB.members,o.memberId)+' (تلقائي)');
  return true;
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
      {h:'الرسوم', render:a=>{ const f = actFinance(a); if(!f.hasFinance) return '<span class="muted">—</span>'; return `${fmtMoney(f.collected)} / ${fmtMoney(f.expected)} ${f.expected && f.collected >= f.expected ? '<span class="pill pill-present">مكتمل</span>' : ''}`; }},
      {h:'', render:a=>`<div class="row-actions">${Scope.current() ? '' : `<button class="btn btn-primary btn-sm" title="الرسوم والمصروفات" onclick="Activities.finance('${a.id}')">💰</button>`}<button class="btn btn-ghost btn-sm" onclick="Activities.openForm('${a.id}')">تعديل</button><button class="btn btn-danger btn-sm" onclick="Activities.remove('${a.id}')">حذف</button></div>`},
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
      <div class="field"><label>رسوم المشاركة للفرد (ج.م) — اختياري</label><input type="number" id="f-fee" min="0" step="any" value="${a.fee || ''}"></div>
      <div class="field full"><label>ملاحظات</label><textarea id="f-notes" rows="2">${esc(a.notes||'')}</textarea></div>
      <div class="field full"><label>المشاركون</label>
        <div class="toolbar" style="margin-bottom:8px;">
          <select id="pt-stage" onchange="Activities.filterParticipants()" style="min-width:120px;">${selectOptions(DB.stages,'','كل المراحل')}</select>
          <input id="pt-search" placeholder="بحث بالاسم أو الكود..." oninput="Activities.filterParticipants()" onkeydown="if(event.key==='Enter'){ Activities.checkByCode(this.value); this.value=''; Activities.filterParticipants(); }" style="flex:1; min-width:140px;">
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
    responsible:document.getElementById('f-resp').value.trim(), notes:document.getElementById('f-notes').value.trim(), participants,
    fee: Math.max(0, Number(document.getElementById('f-fee').value) || 0) };
  try{
    if(id){ await fsUpdate('activities', id, data); await log('تعديل نشاط', name); }
    else { await fsAdd('activities', data); await log('إضافة نشاط', name); }
    UI.closeModal(); toast('تم الحفظ بنجاح'); App.navigate('activities');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
/* ---------- رسوم ومصروفات الأنشطة ----------
   على مستند النشاط نفسه (من غير مجموعة جديدة ولا تعديل في القواعد): fee = رسوم الفرد، payments = {memberId:{paid,date,by}}، expenses = [{title,amount}].
   التحديث بيتم بمسار الحقل (payments.<id>) للي اتغيّر بس، عشان خادمين يحصّلوا في نفس الوقت من غير ما واحد يمسح دفعات التاني. */
function fmtNum(n){ n = Math.round((Number(n) || 0) * 100) / 100; return n.toLocaleString('en-US', {maximumFractionDigits:2}); }
function fmtMoney(n){ return fmtNum(n) + ' ج'; }
function actFinance(a){
  const fee = Number(a.fee) || 0, parts = a.participants || [], pay = a.payments || {};
  const paidOf = id => Number((pay[id] || {}).paid) || 0;
  const expected = fee * parts.length;
  const collected = Object.keys(pay).reduce((n, id)=>n + paidOf(id), 0);
  const unpaid = parts.filter(id=>paidOf(id) < fee);
  const remaining = parts.reduce((n, id)=>n + Math.max(0, fee - paidOf(id)), 0);
  const expenses = (a.expenses || []).reduce((n, e)=>n + (Number(e.amount) || 0), 0);
  return {fee, count:parts.length, expected, collected, remaining, unpaid, expenses, net: collected - expenses, hasFinance: fee > 0 || collected > 0 || expenses > 0};
}
Activities.finance = function(id){
  if(Scope.current()){ toast('الرسوم متاحة للمدير والمستخدم الإداري فقط'); return; }
  const a = byId(DB.activities, id); if(!a) return;
  const pay = a.payments || {};
  const ids = [...new Set([...(a.participants || []), ...Object.keys(pay)])];
  const rows = ids.map(mid=>{ const m = byId(DB.members, mid); return {mid, name: m ? m.name : 'مخدوم محذوف', cls: m ? nameOf(DB.classes, m.classId) : '', isPart: (a.participants||[]).includes(mid), paid: Number((pay[mid]||{}).paid) || 0}; })
    .sort((x,y)=>x.name.localeCompare(y.name, 'ar'));
  const expenses = a.expenses || [];
  UI.openModal('💰 ' + a.name, `
    <div id="fin-summary" style="display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:8px; margin-bottom:12px;"></div>
    <div class="form-grid"><div class="field"><label>رسوم الفرد (ج.م)</label><input type="number" id="fin-fee" min="0" step="any" value="${a.fee || ''}" oninput="Activities.finRecalc()"></div></div>
    <h3 style="font-size:14px; margin:6px 0;">المدفوعات (${rows.length})</h3>
    ${rows.length ? `<table><tbody id="fin-rows">${rows.map(r=>`<tr data-mid="${r.mid}">
      <td>${esc(r.name)}${r.isPart ? '' : ' <span class="muted" style="font-size:11.5px;">(مش في المشاركين)</span>'}<div class="muted" style="font-size:12px;">${esc(r.cls)}</div></td>
      <td style="width:110px;"><input type="number" class="fin-paid" data-mid="${r.mid}" data-orig="${r.paid}" min="0" step="any" value="${r.paid || ''}" placeholder="0" oninput="Activities.finRecalc()"></td>
      <td style="white-space:nowrap;"><button type="button" class="btn btn-ghost btn-sm" onclick="Activities.finFull('${r.mid}')">كامل</button> <button type="button" class="btn btn-ghost btn-sm" title="تذكير واتساب" onclick="Activities.remind('${id}','${r.mid}')">💬</button></td>
      <td class="fin-status"></td></tr>`).join('')}</tbody></table>` : '<p class="muted">مفيش مشاركين متسجّلين في النشاط ده لسه — أضفهم من "تعديل".</p>'}
    <h3 style="font-size:14px; margin:14px 0 6px;">المصروفات</h3>
    <div id="fin-expenses">${expenses.map(e=>Activities._expenseRow(e.title, e.amount)).join('')}</div>
    <button type="button" class="btn btn-ghost btn-sm" onclick="Activities.finAddExpense()">＋ مصروف</button>
  `, `<button class="btn btn-primary" onclick="Activities.finSave('${id}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>`);
  Activities.finRecalc();
};
Activities._expenseRow = function(title, amount){
  return `<div class="fin-exp" style="display:flex; gap:8px; margin-bottom:6px;"><input class="fin-exp-title" placeholder="البند (مثلًا: أتوبيس)" value="${esc(title||'')}" style="flex:1;"><input type="number" class="fin-exp-amount" min="0" step="any" placeholder="المبلغ" value="${amount || ''}" style="width:110px;" oninput="Activities.finRecalc()"><button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.fin-exp').remove(); Activities.finRecalc();">✕</button></div>`;
};
Activities.finAddExpense = function(){ document.getElementById('fin-expenses').insertAdjacentHTML('beforeend', Activities._expenseRow('', '')); };
Activities.finFull = function(mid){
  const fee = Number(document.getElementById('fin-fee').value) || 0;
  const inp = document.querySelector(`.fin-paid[data-mid="${mid}"]`); if(inp){ inp.value = fee || ''; Activities.finRecalc(); }
};
/* بيحسب الملخص وحالة كل واحد من اللي مكتوب في الخانات (لحظيًا قبل الحفظ) */
Activities.finRecalc = function(){
  const fee = Number(document.getElementById('fin-fee').value) || 0;
  const inputs = [...document.querySelectorAll('.fin-paid')];
  let collected = 0, remaining = 0, partsCount = 0;
  const a = null;
  inputs.forEach(inp=>{
    const paid = Number(inp.value) || 0; collected += paid;
    const tr = inp.closest('tr'), isPart = !/مش في المشاركين/.test(tr.textContent), cell = tr.querySelector('.fin-status');
    if(isPart){ partsCount++; remaining += Math.max(0, fee - paid); }
    cell.innerHTML = !fee ? '' : paid >= fee ? (paid > fee ? '<span class="pill pill-present">زيادة</span>' : '<span class="pill pill-present">مدفوع</span>') : paid > 0 ? `<span class="pill" style="background:var(--gold-soft);">جزئي (باقي ${fmtNum(fee - paid)})</span>` : '<span class="pill pill-absent">لم يدفع</span>';
  });
  const expenses = [...document.querySelectorAll('.fin-exp-amount')].reduce((n, i)=>n + (Number(i.value) || 0), 0);
  const box = (label, val, hi) => `<div style="background:var(--paper); border:1px solid var(--line); border-radius:9px; padding:8px 10px; ${hi ? 'border-color:var(--navy);' : ''}"><div class="muted" style="font-size:11.5px;">${label}</div><div style="font-weight:700;">${val}</div></div>`;
  document.getElementById('fin-summary').innerHTML = box('المطلوب', fmtMoney(fee * partsCount)) + box('المحصّل', fmtMoney(collected)) + box('المتبقي', fmtMoney(remaining)) + box('المصروفات', fmtMoney(expenses)) + box('الصافي', fmtMoney(collected - expenses), true);
};
Activities.finSave = async function(id){
  const a = byId(DB.activities, id); if(!a) return;
  const updates = {};
  const fee = Math.max(0, Number(document.getElementById('fin-fee').value) || 0);
  if(fee !== (Number(a.fee) || 0)) updates.fee = fee;
  document.querySelectorAll('.fin-paid').forEach(inp=>{
    const mid = inp.dataset.mid, now = Math.max(0, Number(inp.value) || 0), before = Number((a.payments || {})[mid] && a.payments[mid].paid) || 0;
    if(now !== before) updates['payments.' + mid] = {paid: now, date: todayISO(), by: (CURRENT_USER && CURRENT_USER.name) || ''};
  });
  const expenses = [...document.querySelectorAll('.fin-exp')].map(r=>({title: r.querySelector('.fin-exp-title').value.trim(), amount: Math.max(0, Number(r.querySelector('.fin-exp-amount').value) || 0)})).filter(e=>e.title || e.amount);
  if(JSON.stringify(expenses) !== JSON.stringify((a.expenses || []).map(e=>({title:e.title||'', amount:Number(e.amount)||0})))) updates.expenses = expenses;
  if(!Object.keys(updates).length){ toast('مفيش تغييرات للحفظ'); return; }
  try{
    await fsUpdate('activities', id, updates);
    await log('تحديث رسوم/مصروفات نشاط', a.name);
    UI.closeModal(); toast('تم حفظ الرسوم والمصروفات');
  }catch(e){ console.error(e); toast('تعذر الحفظ: ' + e.message); }
};
/* تذكير واتساب برسوم النشاط: بيتفتح مباشرة (من غير ما نقفل نافذة التحصيل)، لولي الأمر لو رقمه موجود وإلا للمخدوم */
Activities.remind = function(id, mid){
  const a = byId(DB.activities, id), m = byId(DB.members, mid); if(!a || !m) return;
  const fee = Number(document.getElementById('fin-fee').value) || 0;
  const inp = document.querySelector(`.fin-paid[data-mid="${mid}"]`), paid = inp ? Number(inp.value) || 0 : 0;
  const remaining = Math.max(0, fee - paid);
  if(!fee){ toast('حدد رسوم الفرد الأول'); return; }
  if(!remaining){ toast(m.name + ' مسدد بالكامل'); return; }
  const phone = DataQuality.phoneIssue(m.guardianPhone) === '' ? m.guardianPhone : m.phone;
  const url = waLink(phone, WA.fill(WA.getTemplate('payment'), m, {'النشاط': a.name, 'المبلغ_المتبقي': fmtNum(remaining), 'المبلغ_المطلوب': fmtNum(fee)}));
  if(!url){ toast('مفيش رقم هاتف مسجّل لـ ' + m.name); return; }
  if(!window.open(url, '_blank')){ toast('برجاء السماح بفتح نوافذ منبثقة عشان يتفتح واتساب'); return; }
  log('تذكير برسوم نشاط', m.name + ' — ' + a.name);
};
Activities.remove = async function(id){
  if(!confirm('نقل النشاط لسلة المحذوفات؟ تقدر تسترجعه خلال ٣٠ يوم.')) return;
  try{ await updateDoc(doc(dbFire,'activities',id), {deletedAt: Date.now()}); App.navigate('activities'); toast('تم النقل لسلة المحذوفات'); }
  catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};

/* ---------- Reports ---------- */
Views.reports = function(){
  $content().innerHTML = `
    <div class="section-head no-print"><h2>مركز التقارير</h2></div>
    <div class="info-card-grid no-print">
      ${reportCard('📘 التقرير السنوي','تقرير شامل قابل للطباعة للعام الدراسي: الحضور شهريًا، المراحل والفصول، الملتزمون، التقييمات، الأنشطة، المتابعة.','Reports.annual(\'school0\')')}
      ${reportCard('💰 رسوم ومصروفات الأنشطة','المحصّل والمتبقي والمصروفات والصافي لكل نشاط، وقايمة غير المسددين.','Reports.activitiesFinance()')}
      ${reportCard('📖 جدول المنهج','الدروس المسجّلة لكل مرحلة مع الآية ونسبة الحضور في يوم كل درس.','Reports.lessons()')}
      ${reportCard('🧹 فحص جودة البيانات','بيكشف بيانات ناقصة أو غلط: أرقام هاتف، تواريخ ميلاد، فصول، أكواد مكررة، وأسماء مكررة — مع تعديل مباشر.','Reports.dataQuality()')}
      ${reportCard('كشف جميع المخدومين','قائمة كاملة ببيانات المخدومين مع المرحلة والفصل والحالة.','Reports.membersList()')}
      ${reportCard('📞 دليل أرقام أولياء الأمور','أسماء وأرقام أولياء الأمور لكل مخدوم، جاهز للطباعة أو التواصل.','Reports.guardianContacts()')}
      ${reportCard('👥 كشف الخدام','بيانات كل الخدام وفصولهم وأرقامهم وحساباتهم المرتبطة.','Reports.servantsList()')}
      ${reportCard('📅 دفتر أعياد الميلاد','كل المخدومين مرتبين بشهر وتاريخ الميلاد، مع فلتر بشهر معيّن.','Reports.birthdays()')}
      ${reportCard('كشف حضور خلال فترة','تقرير حضور وغياب تفصيلي حسب المرحلة/الفصل وفترة زمنية.','Reports.attendanceRange()')}
      ${reportCard('كشف حضور فردي','تقرير حضور وغياب مخدوم واحد بعينه خلال فترة محددة.','Reports.individualAttendance()')}
      ${reportCard('تقرير الحضور الإجمالي','إجمالي أيام الحضور والغياب ونسبة الحضور لكل مخدوم.','Reports.attendanceTotal()')}
      ${reportCard('الغياب المتكرر','قائمة المخدومين الذين يحتاجون متابعة بسبب الغياب.','Reports.needFollowup()')}
      ${reportCard('📊 تقرير التقييمات التفصيلي','متوسط كل معيار تقييم لكل مخدوم على حدة (مش رقم واحد مجمّع).','Reports.evaluationsReport()')}
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
/* شعار الكنيسة: بيتحط فوق أي تقرير أو ورقة طباعة لو الكنيسة رفعته من الإعدادات. فاضي = مفيش حاجة (زي ما كان قبل الميزة دي). */
function logoImgTag(maxH){
  const src = (DB.settings || {}).churchLogo;
  return src ? `<img src="${esc(src)}" style="height:${maxH || 46}px; max-width:220px; object-fit:contain; display:block; margin:0 auto 6px;">` : '';
}
/* ملف CSV من أول جدول في التقرير المعروض. أي عمود عنوانه فاضي (زي عمود الأزرار/الإجراءات) بيتستبعد أوتوماتيك.
   BOM في الأول عشان إكسل العربي يفتح الملف بترميز صحيح من غير ما يتلخبط. */
function csvCell(text){
  text = String(text == null ? '' : text).replace(/\s+/g,' ').trim();
  if(/[",\n]/.test(text)) text = '"' + text.replace(/"/g,'""') + '"';
  return text;
}
function exportTableToCSV(filename){
  const table = document.querySelector('#report-output table');
  if(!table){ toast('مفيش جدول للتصدير'); return; }
  const rows = [...table.querySelectorAll('tr')];
  if(!rows.length){ toast('مفيش بيانات للتصدير'); return; }
  const headerCells = [...rows[0].querySelectorAll('th')];
  const keepIdx = headerCells.map((th,i)=> th.textContent.trim() ? i : -1).filter(i=>i>=0);
  const lines = rows.map(tr=>{
    const cells = [...tr.querySelectorAll('th,td')];
    return keepIdx.map(i=> csvCell(cells[i] ? cells[i].textContent : '')).join(',');
  });
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename.replace(/[\/\\:*?"<>|]/g,'') + '.csv';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}
function reportShell(title, tableHtml, extraControlsHtml){
  const csvName = String(title).replace(/<[^>]+>/g,'').trim();
  document.getElementById('report-output').innerHTML = `
    <div class="card card-pad">
      <div class="section-head"><h2>${title}</h2>
        <div class="toolbar no-print">${extraControlsHtml||''}<button class="btn btn-ghost btn-sm" onclick="exportTableToCSV('${esc(csvName).replace(/'/g,"&#39;")}')">⬇️ تصدير CSV</button><button class="btn btn-gold btn-sm" onclick="window.print()">طباعة / حفظ PDF</button></div>
      </div>
      <div class="print-only" style="margin-bottom:10px;font-size:13px;color:var(--ink-soft); text-align:center;">
        ${logoImgTag(44)}
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
Reports.guardianContacts = function(){
  const rows = DB.members.filter(m=>m.status!=='inactive').slice().sort((a,b)=>a.name.localeCompare(b.name,'ar'));
  reportShell('📞 دليل أرقام أولياء الأمور ('+rows.length+')', `
    <table><thead><tr><th>المخدوم</th><th>الفصل</th><th>ولي الأمر</th><th>رقم ولي الأمر</th><th>رقم المخدوم</th></tr></thead>
    <tbody>${rows.length ? rows.map(m=>`<tr><td>${esc(m.name)}</td><td>${esc(nameOf(DB.classes,m.classId))}</td><td>${esc(m.guardianName||'—')}</td><td>${esc(m.guardianPhone||'—')}</td><td>${esc(m.phone||'—')}</td></tr>`).join('') : `<tr><td colspan="5" class="muted">لا يوجد مخدومون نشطون.</td></tr>`}</tbody></table>
  `);
};
Reports.servantsList = function(){
  const rows = DB.servants;
  reportShell('👥 كشف جميع الخدام ('+rows.length+')', `
    <table><thead><tr><th>الاسم</th><th>الفصول</th><th>الهاتف</th><th>الحساب المرتبط</th><th>الحالة</th></tr></thead>
    <tbody>${rows.length ? rows.map(sv=>{
      const classNames = servantClassIds(sv).map(id=>nameOf(DB.classes,id)).filter(Boolean).join('، ') || '—';
      const acct = (DB.users||[]).find(u=>u.servantId===sv.id);
      return `<tr><td>${esc(sv.name)}</td><td>${esc(classNames)}</td><td>${esc(sv.phone||'—')}</td><td>${acct ? esc(acct.email||acct.name) : '—'}</td><td>${sv.status==='inactive'?'غير نشط':'نشط'}</td></tr>`;
    }).join('') : `<tr><td colspan="5" class="muted">لا يوجد خدام مسجّلون بعد.</td></tr>`}</tbody></table>
  `);
};
const BIRTHDAY_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
/* دفتر أعياد الميلاد: كل المخدومين مرتبين بيوم وشهر الميلاد (بغض النظر عن السنة)، مع فلتر اختياري بشهر معيّن.
   عمود "السن" = العمر اللي هيبلغه المخدوم في السنة الميلادية الحالية (مش عمره الفعلي دلوقتي لو عيد ميلاده لسه ما جاش) — ده المتعارف عليه في دفاتر أعياد الميلاد. */
Reports.birthdays = function(){
  const monthEl = document.getElementById('bd-month');
  const month = monthEl ? monthEl.value : '';
  const thisYear = new Date().getFullYear();
  const rows = DB.members.filter(m=>m.status!=='inactive' && m.birthDate && !isNaN(new Date(m.birthDate)))
    .map(m=>{ const d = new Date(m.birthDate); return {...m, _month:d.getMonth()+1, _day:d.getDate(), _turns: thisYear - d.getFullYear()}; })
    .filter(m=> !month || m._month === Number(month))
    .sort((a,b)=> a._month-b._month || a._day-b._day || a.name.localeCompare(b.name,'ar'));
  reportShell(`📅 دفتر أعياد الميلاد${month ? ' — '+BIRTHDAY_MONTHS[Number(month)-1] : ''} (${rows.length})`, `
    <table><thead><tr><th>اليوم</th><th>الاسم</th><th>الفصل</th><th>السن (هذا العام)</th></tr></thead>
    <tbody>${rows.length ? rows.map(m=>`<tr><td>${String(m._day).padStart(2,'0')} ${BIRTHDAY_MONTHS[m._month-1]}</td><td>${esc(m.name)}</td><td>${esc(nameOf(DB.classes,m.classId))}</td><td>${m._turns} سنة</td></tr>`).join('')
      : `<tr><td colspan="4" class="muted">مفيش مخدومين بتاريخ ميلاد مسجّل${month ? ' في الشهر ده' : ''}.</td></tr>`}</tbody></table>
  `, `<select id="bd-month" onchange="Reports.birthdays()"><option value="">كل الشهور</option>${BIRTHDAY_MONTHS.map((n,i)=>`<option value="${i+1}" ${Number(month)===i+1?'selected':''}>${n}</option>`).join('')}</select>`);
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
/* تقرير التقييمات التفصيلي: متوسط كل معيار على حدة لكل مخدوم (مش رقم واحد مجمّع بيخفي التفاصيل).
   الأعمدة بترتيب EVAL_GROUPS (روحيًا ثم سلوكيًا ثم دراسيًا)، وبتظهر بس المعايير اللي فعلًا اتقيّمت مرة في الكنيسة دي
   (عشان الكنيسة اللي بتستخدم نص المعايير مايبقاش عندها أعمدة فاضية طول الوقت). */
Reports.evaluationsReport = function(){
  const isScored = v => v !== undefined && v !== '' && !isNaN(Number(v));
  const usedKeys = new Set();
  DB.evaluations.forEach(e=>Object.entries(e.scores||{}).forEach(([k,v])=>{ if(isScored(v)) usedKeys.add(k); }));
  const flatKeys = Object.values(EVAL_GROUPS).flat().filter(k=>usedKeys.has(k));
  const rows = DB.members.filter(m=>m.status!=='inactive').map(m=>{
    const evs = DB.evaluations.filter(e=>e.memberId===m.id);
    const perCrit = {};
    flatKeys.forEach(k=>{
      const vals = evs.map(e=>(e.scores||{})[k]).filter(isScored).map(Number);
      perCrit[k] = vals.length ? (vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1) : '—';
    });
    const allVals = evs.flatMap(e=>Object.values(e.scores||{})).filter(isScored).map(Number);
    const overall = allVals.length ? (allVals.reduce((a,b)=>a+b,0)/allVals.length).toFixed(1) : '—';
    return {name:m.name, count:evs.length, perCrit, overall};
  });
  const colCount = flatKeys.length + 3;
  reportShell('📊 تقرير التقييمات التفصيلي', `
    <table><thead><tr><th>المخدوم</th><th>عدد التقييمات</th>${flatKeys.map(k=>`<th>${esc(EVAL_LABELS[k]||k)}</th>`).join('')}<th>المتوسط العام</th></tr></thead>
    <tbody>${rows.length ? rows.map(r=>`<tr><td>${esc(r.name)}</td><td>${r.count}</td>${flatKeys.map(k=>`<td>${r.perCrit[k]}</td>`).join('')}<td><b>${r.overall}</b></td></tr>`).join('') : `<tr><td colspan="${colCount}" class="muted">لا يوجد مخدومون نشطون.</td></tr>`}</tbody></table>
    ${!flatKeys.length ? '<p class="muted" style="margin-top:10px;">لا توجد تقييمات مسجّلة بعد — أضف تقييمات من صفحة "التقييمات" الأول.</p>' : ''}
  `);
};
Reports.followupsReport = function(){
  reportShell('تقرير المتابعة الشامل', `
    <table><thead><tr><th>التاريخ</th><th>المخدوم</th><th>الخادم</th><th>النوع</th><th>الموضوع</th><th>الحالة</th><th>الموعد</th></tr></thead>
    <tbody>${DB.followups.map(f=>`<tr><td>${fmtDate(f.date)}</td><td>${esc(nameOf(DB.members,f.memberId))}</td><td>${esc(nameOf(DB.servants,f.servantId))}</td><td>${esc(f.type)}</td><td>${esc(f.subject)}</td><td>${fupIsOpen(f) ? (fupIsOverdue(f) ? 'متأخرة' : 'مفتوحة') : 'تمت'}</td><td>${f.nextDate ? fmtDate(f.nextDate) : '—'}</td></tr>`).join('')}</tbody></table>
  `);
};
Reports.activitiesReport = function(){
  reportShell('تقرير الأنشطة والمشاركة', `
    <table><thead><tr><th>النشاط</th><th>التاريخ</th><th>المكان</th><th>عدد المشاركين</th></tr></thead>
    <tbody>${DB.activities.map(a=>`<tr><td>${esc(a.name)}</td><td>${fmtDate(a.date)}</td><td>${esc(a.place)}</td><td>${(a.participants||[]).length}</td></tr>`).join('')}</tbody></table>
  `);
};

/* تقرير رسوم ومصروفات الأنشطة: ملخص لكل نشاط (رسوم/محصّل/متبقي/مصروفات/صافي) + قايمة غير المسددين */
Reports.activitiesFinance = function(noScroll){
  const fEl = document.getElementById('fin-from'), tEl = document.getElementById('fin-to');
  let [from, to] = Reports.annualRange('school0');
  if(fEl && tEl && fEl.value && tEl.value){ from = fEl.value; to = tEl.value; }
  if(from > to){ const t = from; from = to; to = t; }
  const acts = DB.activities.filter(a=>String(a.date||'').slice(0,10) >= from && String(a.date||'').slice(0,10) <= to && actFinance(a).hasFinance)
    .sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  const F = acts.map(a=>({a, f: actFinance(a)}));
  const sum = k => F.reduce((n, x)=>n + x.f[k], 0);
  document.getElementById('report-output').innerHTML = `
    <div class="card card-pad">
      <div class="section-head no-print"><h2>💰 رسوم ومصروفات الأنشطة</h2><div class="toolbar">
        <input type="date" id="fin-from" value="${from}" onchange="Reports.activitiesFinance(true)"><span class="muted">إلى</span><input type="date" id="fin-to" value="${to}" onchange="Reports.activitiesFinance(true)">
        <button class="btn btn-gold btn-sm" onclick="window.print()">طباعة / حفظ PDF</button></div></div>
      <div style="text-align:center; margin:10px 0;">${logoImgTag(40)}<b>تقرير رسوم ومصروفات الأنشطة</b> — ${esc((DB.settings||{}).churchName||'')}<br><span class="muted">${fmtDate(from)} إلى ${fmtDate(to)}</span></div>
      <table><thead><tr><th>النشاط</th><th>التاريخ</th><th>المشاركون</th><th>رسوم الفرد</th><th>المطلوب</th><th>المحصّل</th><th>المتبقي</th><th>المصروفات</th><th>الصافي</th></tr></thead><tbody>
        ${F.length ? F.map(({a,f})=>`<tr><td>${esc(a.name)}</td><td>${fmtDate(a.date)}</td><td>${f.count}</td><td>${fmtNum(f.fee)}</td><td>${fmtNum(f.expected)}</td><td>${fmtNum(f.collected)}</td><td>${fmtNum(f.remaining)}</td><td>${fmtNum(f.expenses)}</td><td><b>${fmtNum(f.net)}</b></td></tr>`).join('') + `<tr style="font-weight:800; background:var(--paper);"><td colspan="4">الإجمالي</td><td>${fmtNum(sum('expected'))}</td><td>${fmtNum(sum('collected'))}</td><td>${fmtNum(sum('remaining'))}</td><td>${fmtNum(sum('expenses'))}</td><td>${fmtNum(sum('net'))}</td></tr>` : `<tr><td colspan="9" class="muted">مفيش أنشطة عليها رسوم أو مصروفات في الفترة دي. حدد الرسوم من "الأنشطة" ← 💰.</td></tr>`}
      </tbody></table>
      ${F.filter(x=>x.f.fee > 0 && x.f.unpaid.length).map(({a,f})=>`<details class="ann-sec" style="margin-top:14px; break-inside:auto;" ${f.unpaid.length <= 10 ? 'open' : ''}>
        <summary style="cursor:pointer; font-weight:700;">غير المسددين في "${esc(a.name)}" <span class="pill pill-absent">${f.unpaid.length}</span></summary>
        <table><tbody>${f.unpaid.map(mid=>{ const m = byId(DB.members, mid), paid = Number(((a.payments||{})[mid]||{}).paid) || 0; return `<tr><td>${esc(m ? m.name : 'مخدوم محذوف')}</td><td class="muted">${esc(m ? nameOf(DB.classes, m.classId) : '')}</td><td>${paid ? 'دفع ' + fmtNum(paid) + ' — ' : ''}باقي <b>${fmtNum(Math.max(0, f.fee - paid))}</b></td></tr>`; }).join('')}</tbody></table></details>`).join('')}
    </div>`;
  const out = document.getElementById('report-output'); if(!noScroll && out.scrollIntoView) out.scrollIntoView({behavior:'smooth', block:'start'});
};

/* ---------- المنهج الأسبوعي ----------
   درس كل أسبوع لكل مرحلة (العنوان + الآية + ملاحظات). بيتخزن جوه settings/{الكنيسة}.lessons كخريطة مفتاحها "التاريخ|المرحلة"
   (من غير مجموعة جديدة في Firestore فمفيش تعديل في القواعد، وبيدخل في النسخة الاحتياطية). الدرس المحذوف = عنوان فاضي. */
function lessonKey(date, stageId){ return date + '|' + stageId; }
function getLesson(date, stageId){ const l = ((DB.settings || {}).lessons || {})[lessonKey(date, stageId)]; return l && l.title ? l : null; }
function localISO(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
const Lessons = {};
Lessons.openForm = function(date, stageId){
  const cur = date && stageId ? getLesson(date, stageId) : null;
  const l = cur || {};
  Lessons._orig = cur ? {date, stageId} : null;
  UI.openModal(cur ? 'تعديل درس' : 'تسجيل درس', `
    <div class="form-grid">
      <div class="field"><label>التاريخ</label><input type="date" id="l-date" value="${date || todayISO()}"></div>
      <div class="field"><label>المرحلة</label><select id="l-stage">${selectOptions(DB.stages, stageId || '')}</select></div>
      <div class="field full"><label>عنوان الدرس</label><input id="l-title" value="${esc(l.title||'')}"></div>
      <div class="field full"><label>الآية / الحفظ</label><input id="l-verse" value="${esc(l.verse||'')}"></div>
      <div class="field full"><label>ملاحظات (اختياري)</label><textarea id="l-notes" rows="2">${esc(l.notes||'')}</textarea></div>
    </div>`,
    `<button class="btn btn-primary" onclick="Lessons.save()">حفظ</button>${cur ? `<button class="btn btn-danger" onclick="Lessons.remove('${date}','${stageId}')">حذف الدرس</button>` : ''}<button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
Lessons.save = async function(){
  const date = document.getElementById('l-date').value, stageId = document.getElementById('l-stage').value, title = document.getElementById('l-title').value.trim();
  if(!date || !stageId){ toast('اختار التاريخ والمرحلة'); return; }
  if(!title){ toast('اكتب عنوان الدرس'); return; }
  const orig = Lessons._orig, changedSlot = orig && (orig.date !== date || orig.stageId !== stageId);
  if((!orig || changedSlot) && getLesson(date, stageId) && !confirm('فيه درس متسجّل بنفس التاريخ والمرحلة. تستبدله؟')) return;
  const updates = {};
  updates[lessonKey(date, stageId)] = { title, verse: document.getElementById('l-verse').value.trim(), notes: document.getElementById('l-notes').value.trim(), by: (CURRENT_USER && CURRENT_USER.name) || '', updatedAt: Date.now() };
  if(changedSlot) updates[lessonKey(orig.date, orig.stageId)] = {title:'', verse:'', notes:''};
  try{
    await fsSet('settings', CURRENT_CHURCH_ID, {lessons: updates});
    DB.settings.lessons = {...(DB.settings.lessons || {}), ...updates};   // تحديث فوري (الـ snapshot هيأكده)
    await log('تسجيل درس', title);
    UI.closeModal(); toast('تم حفظ الدرس'); Lessons.afterChange();
  }catch(e){ console.error(e); toast('تعذر الحفظ: ' + e.message); }
};
Lessons.remove = async function(date, stageId){
  if(!confirm('حذف الدرس ده؟')) return;
  const updates = {}; updates[lessonKey(date, stageId)] = {title:'', verse:'', notes:''};
  try{
    await fsSet('settings', CURRENT_CHURCH_ID, {lessons: updates});
    DB.settings.lessons = {...(DB.settings.lessons || {}), ...updates};
    await log('حذف درس', date);
    UI.closeModal(); toast('تم حذف الدرس'); Lessons.afterChange();
  }catch(e){ console.error(e); toast('تعذر الحذف: ' + e.message); }
};
/* بعد أي تغيير: نحدّث الشريط في صفحة الحضور أو جدول المنهج المعروض (الصفحتين محميين من إعادة الرسم اللحظية) */
Lessons.afterChange = function(){
  if(CURRENT_PAGE === 'attendance') Attendance.refreshLesson();
  else if(CURRENT_PAGE === 'reports' && document.getElementById('les-from')) Reports.lessons(true);
};
Attendance.lessonHtml = function(){
  const classId = (document.getElementById('att-class') || {}).value, date = (document.getElementById('att-date') || {}).value;
  const cls = byId(DB.classes, classId); if(!cls || !date) return '';
  const stageName = nameOf(DB.stages, cls.stageId), l = getLesson(date, cls.stageId);
  const wrap = inner => `<div class="card card-pad" style="margin-bottom:12px; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">${inner}</div>`;
  return l
    ? wrap(`<div>📖 <b>درس ${fmtDate(date)} — ${esc(stageName)}:</b> ${esc(l.title)}${l.verse ? ` <span class="muted">— ${esc(l.verse)}</span>` : ''}${l.notes ? `<div class="muted" style="font-size:12.5px;">${esc(l.notes)}</div>` : ''}</div><button class="btn btn-ghost btn-sm" onclick="Lessons.openForm('${date}','${cls.stageId}')">تعديل</button>`)
    : wrap(`<div class="muted">📖 مفيش درس متسجّل لمرحلة ${esc(stageName)} في ${fmtDate(date)}</div><button class="btn btn-ghost btn-sm" onclick="Lessons.openForm('${date}','${cls.stageId}')">＋ سجّل الدرس</button>`);
};
Attendance.refreshLesson = function(){ const el = document.getElementById('att-lesson'); if(el) el.innerHTML = Attendance.lessonHtml(); };
/* جدول المنهج: الدروس المسجّلة في فترة (افتراضيًا العام الدراسي الحالي) لكل المراحل أو مرحلة، مع نسبة الحضور في يوم كل درس */
Reports.lessonRows = function(from, to, stageId){
  const stageOfClass = {}; DB.classes.forEach(c=>{ stageOfClass[c.id] = c.stageId; });
  return Object.entries((DB.settings || {}).lessons || {}).map(([k, l])=>{
    const i = k.lastIndexOf('|'); return {date:k.slice(0,i), stageId:k.slice(i+1), ...l};
  }).filter(l=>l.title && l.date >= from && l.date <= to && (!stageId || l.stageId === stageId)).map(l=>{
    const recs = DB.attendance.filter(a=>a.date === l.date && stageOfClass[a.classId] === l.stageId);
    return {...l, total: recs.length, pct: recs.length ? Math.round(recs.filter(a=>a.present).length / recs.length * 100) : null};
  }).sort((a,b)=> a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.stageId).localeCompare(String(b.stageId)));
};
Reports.lessons = function(noScroll){
  const fEl = document.getElementById('les-from'), tEl = document.getElementById('les-to'), sEl = document.getElementById('les-stage');
  let [from, to] = Reports.annualRange('school0'), stageId = '';
  if(fEl && tEl && fEl.value && tEl.value){ from = fEl.value; to = tEl.value; stageId = sEl ? sEl.value : ''; }
  if(from > to){ const t = from; from = to; to = t; }
  const rows = Reports.lessonRows(from, to, stageId);
  document.getElementById('report-output').innerHTML = `
    <div class="card card-pad">
      <div class="section-head no-print"><h2>📖 جدول المنهج</h2><div class="toolbar">
        <select id="les-stage" onchange="Reports.lessons(true)"><option value="">كل المراحل</option>${DB.stages.map(st=>`<option value="${st.id}" ${st.id===stageId?'selected':''}>${esc(st.name)}</option>`).join('')}</select>
        <input type="date" id="les-from" value="${from}" onchange="Reports.lessons(true)"><span class="muted">إلى</span><input type="date" id="les-to" value="${to}" onchange="Reports.lessons(true)">
        <button class="btn btn-primary btn-sm" onclick="Lessons.openForm('${todayISO()}','${stageId}')">＋ درس جديد</button>
        <button class="btn btn-gold btn-sm" onclick="window.print()">طباعة / حفظ PDF</button></div></div>
      <div style="text-align:center; margin:10px 0;">${logoImgTag(40)}<b>جدول المنهج</b> — ${esc((DB.settings||{}).churchName||'')}<br><span class="muted">${fmtDate(from)} إلى ${fmtDate(to)}</span></div>
      <table><thead><tr><th>التاريخ</th><th>المرحلة</th><th>الدرس</th><th>الآية / الحفظ</th><th>الحضور</th><th class="no-print"></th></tr></thead><tbody>
        ${rows.length ? rows.map(l=>`<tr><td>${fmtDate(l.date)}</td><td>${esc(nameOf(DB.stages,l.stageId))}</td><td>${esc(l.title)}${l.notes ? `<div class="muted" style="font-size:12px;">${esc(l.notes)}</div>` : ''}</td><td class="muted">${esc(l.verse||'—')}</td><td>${l.pct === null ? '—' : l.pct + '%'}</td>
          <td class="no-print"><button class="btn btn-ghost btn-sm" onclick="Lessons.openForm('${l.date}','${l.stageId}')">تعديل</button></td></tr>`).join('') : `<tr><td colspan="6" class="muted">مفيش دروس متسجّلة في الفترة دي. سجّل الدرس من صفحة الحضور أو زر "＋ درس جديد".</td></tr>`}
      </tbody></table>
    </div>`;
  const out = document.getElementById('report-output'); if(!noScroll && out.scrollIntoView) out.scrollIntoView({behavior:'smooth', block:'start'});
};

/* ---------- فحص جودة البيانات ----------
   بيفحص المخدومين النشطين (مفيش هاتف/هاتف غلط/ميلاد ناقص أو غير منطقي/فصل ناقص أو مش متسق/كود ناقص أو مكرر/اسم مكرر) والخدام النشطين،
   وبيعرض كل مشكلة مع زر تعديل مباشر (بعد الحفظ نفضل في التقرير وبيتعاد الفحص). مابيغيّرش أي بيانات بنفسه. */
const DataQuality = {};
/* '' = سليم · 'missing' = فاضي · 'invalid' = شكله غلط. بيقبل موبايل مصري (010/011/012/015) بأي صيغة (+20 / 0020 / من غير صفر)، وأرضي، وأرقام دولية بـ + */
DataQuality.phoneIssue = function(p){
  const raw = String(p||'').trim();
  if(!raw) return 'missing';
  let d = raw.replace(/[^\d]/g,'');
  if(!d) return 'invalid';
  if(d.startsWith('0020')) d = d.slice(2);
  if(d.startsWith('20') && d.length >= 12) d = '0' + d.slice(2);
  if(/^01[0125]\d{8}$/.test(d)) return '';
  if(/^1[0125]\d{8}$/.test(d)) return '';          // موبايل من غير الصفر الأول (شائع في ملفات Excel)
  if(/^0[2-9]\d{7,8}$/.test(d)) return '';          // أرضي
  if(raw.startsWith('+') && !raw.startsWith('+20') && d.length >= 8 && d.length <= 15) return '';   // دولي
  return 'invalid';
};
DataQuality.compute = function(){
  const norm = v => String(v||'').trim().toLowerCase();
  const classById = {}; DB.classes.forEach(c=>{ classById[c.id] = c; });
  const active = DB.members.filter(m=>m.status !== 'inactive');
  const codes = {}; active.forEach(m=>{ const c = norm(m.code); if(c) codes[c] = (codes[c]||0) + 1; });
  const cats = {dupCode:[], noClass:[], noPhone:[], badPhone:[], noBirth:[], badBirth:[], classMismatch:[], noCode:[]};
  const flagged = new Set();
  const push = (k, m, detail) => { cats[k].push({m, detail:detail||''}); flagged.add(m.id); };
  active.forEach(m=>{
    const p1 = DataQuality.phoneIssue(m.phone), p2 = DataQuality.phoneIssue(m.guardianPhone);
    if(p1 === 'missing' && p2 === 'missing') push('noPhone', m);
    const bad = [p1 === 'invalid' ? 'هاتف المخدوم: ' + m.phone : '', p2 === 'invalid' ? 'هاتف ولي الأمر: ' + m.guardianPhone : ''].filter(Boolean);
    if(bad.length) push('badPhone', m, bad.join(' — '));
    if(!m.birthDate) push('noBirth', m);
    else { const b = new Date(m.birthDate), a = age(m.birthDate); if(isNaN(b) || b > new Date() || (typeof a === 'number' && a > 60)) push('badBirth', m, isNaN(b) ? String(m.birthDate) : fmtDate(m.birthDate)); }
    if(!m.classId) push('noClass', m, 'من غير فصل');
    else if(!classById[m.classId]) push('noClass', m, 'الفصل المسجّل اتحذف');
    else { const c = classById[m.classId]; if((m.gradeId && c.gradeId && m.gradeId !== c.gradeId) || (m.stageId && c.stageId && m.stageId !== c.stageId)) push('classMismatch', m, 'الفصل: ' + c.name); }
    if(!norm(m.code)) push('noCode', m);
    else if(codes[norm(m.code)] > 1) push('dupCode', m, 'الكود: ' + m.code);
  });
  // أسماء مكررة (بعد توحيد الهمزات والمسافات)
  const byName = {};
  active.forEach(m=>{ const k = normalizeArabic(m.name).replace(/\s+/g,' ').toLowerCase(); if(k) (byName[k] = byName[k] || []).push(m); });
  const dupNames = Object.values(byName).filter(g=>g.length > 1);
  dupNames.forEach(g=>g.forEach(m=>flagged.add(m.id)));
  // الخدام
  const svActive = DB.servants.filter(x=>x.status !== 'inactive');
  const svCodes = {}; svActive.forEach(x=>{ const c = norm(x.code); if(c) svCodes[c] = (svCodes[c]||0) + 1; });
  const sv = {noPhone:[], badPhone:[], noClass:[], dupCode:[]};
  svActive.forEach(x=>{
    const p = DataQuality.phoneIssue(x.phone);
    if(p === 'missing') sv.noPhone.push({m:x, detail:''}); else if(p === 'invalid') sv.badPhone.push({m:x, detail:'الهاتف: ' + x.phone});
    if(!x.classId) sv.noClass.push({m:x, detail:'من غير فصل'}); else if(!classById[x.classId]) sv.noClass.push({m:x, detail:'الفصل المسجّل اتحذف'});
    if(norm(x.code) && svCodes[norm(x.code)] > 1) sv.dupCode.push({m:x, detail:'الكود: ' + x.code});
  });
  const memberIssues = Object.values(cats).reduce((n,l)=>n + l.length, 0) + dupNames.length;
  const servantIssues = Object.values(sv).reduce((n,l)=>n + l.length, 0);
  return { activeCount: active.length, cats, dupNames, sv, memberIssues, servantIssues, totalIssues: memberIssues + servantIssues,
    completePct: active.length ? Math.round((active.length - flagged.size) / active.length * 100) : 100 };
};
/* إعادة الفحص بعد تعديل/حذف: مرة فورًا ومرة بعد لحظة (عشان تحديث Firestore اللحظي يكون وصل)، من غير ما نسحب المستخدم لأول التقرير */
DataQuality.refresh = function(){
  const go = ()=>{ if(CURRENT_PAGE === 'reports' && document.getElementById('report-output')) Reports.dataQuality(true); };
  go(); setTimeout(go, 400);
};
DataQuality.edit = function(id){ Members.openForm(id); Members._afterSave = DataQuality.refresh; };
DataQuality.editServant = function(id){ Servants.openForm(id); Servants._afterSave = DataQuality.refresh; };
DataQuality.remove = function(id){ Members._afterSave = DataQuality.refresh; Members.remove(id); };
DataQuality.dashboardHint = function(){
  if(!CURRENT_USER || !(CURRENT_USER.role === 'admin' || IMPERSONATING) || DB.members.length < 3) return '';
  const r = DataQuality.compute();
  if(!r.totalIssues) return '';
  return `<div class="card card-pad no-print" style="margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
    <span>🧹 اكتمال ملفات المخدومين <b>${r.completePct}%</b> — فيه <b>${r.totalIssues}</b> ملاحظة تستاهل تتصلّح.</span>
    <button class="btn btn-ghost btn-sm" onclick="App.navigate('reports'); Reports.dataQuality();">افتح الفحص</button></div>`;
};
Reports.dataQuality = function(noScroll){
  const R = DataQuality.compute();
  const LABELS = {
    dupCode:['♊','كود مكرر','بيبوّظ مسح الباركود'], noClass:['🏫','من غير فصل صالح','مش هيظهر في تسجيل الحضور'],
    noPhone:['📵','من غير أي رقم هاتف','لا للمخدوم ولا لولي الأمر — مهم للتواصل والافتقاد'], badPhone:['⚠️','رقم هاتف شكله غير صحيح','المفروض 11 رقم يبدأ بـ 010/011/012/015'],
    noBirth:['🎂','من غير تاريخ ميلاد','عشان الأعمار وتهنئة أعياد الميلاد'], badBirth:['📅','تاريخ ميلاد غير منطقي','تاريخ مستقبلي أو عمر أكبر من 60'],
    classMismatch:['🔀','الفصل مش تابع للمرحلة/الصف المسجّل','راجع المرحلة والصف والفصل'], noCode:['🏷️','من غير كود','الكود بيتستخدم في الباركود'],
  };
  const byName = (a,b) => String(a.m.name).localeCompare(String(b.m.name), 'ar');
  const rowsTable = (list, editFn, showClass) => `<table><tbody>${[...list].sort(byName).map(x=>`<tr><td>${esc(x.m.name)}</td>${showClass ? `<td class="muted">${esc(nameOf(DB.classes, x.m.classId))}</td>` : ''}<td class="muted">${esc(x.detail)}</td><td class="no-print" style="width:1%; white-space:nowrap;"><button class="btn btn-ghost btn-sm" onclick="${editFn}('${x.m.id}')">تعديل</button></td></tr>`).join('')}</tbody></table>`;
  const section = (key, list, editFn, showClass, labels) => list.length ? `<details class="ann-sec ann-long" ${list.length <= 8 ? 'open' : ''} style="margin-top:14px; break-inside:auto;">
      <summary style="cursor:pointer; font-weight:700;">${labels[0]} ${labels[1]} <span class="pill pill-absent">${list.length}</span> <span class="muted" style="font-weight:400; font-size:12.5px;">— ${labels[2]}</span></summary>
      <div style="margin-top:8px;">${rowsTable(list, editFn, showClass)}</div></details>` : '';
  const dupNamesHtml = R.dupNames.length ? `<details class="ann-sec ann-long" open style="margin-top:14px; break-inside:auto;">
      <summary style="cursor:pointer; font-weight:700;">👯 أسماء مكررة <span class="pill pill-absent">${R.dupNames.length}</span> <span class="muted" style="font-weight:400; font-size:12.5px;">— ممكن يكون نفس الشخص اتسجّل مرتين (أو إخوة بنفس الاسم). احذف السجل الأقل بيانات (بيروح لسلة المحذوفات ويتسترجع خلال 30 يوم)</span></summary>
      ${R.dupNames.map(g=>`<div class="card card-pad" style="margin-top:8px;"><b>${esc(g[0].name)}</b> — ${g.length} سجلات
        <table><tbody>${g.map(m=>{ const att = DB.attendance.filter(a=>a.memberId===m.id).length, ev = DB.evaluations.filter(e=>e.memberId===m.id).length, fu = DB.followups.filter(f=>f.memberId===m.id).length;
          return `<tr><td class="muted">${esc(m.code||'—')}</td><td>${esc(nameOf(DB.classes,m.classId))}</td><td class="muted">${esc(m.phone||m.guardianPhone||'—')}</td><td class="muted">${m.birthDate ? fmtDate(m.birthDate) : '—'}</td>
          <td class="muted">حضور ${att} · تقييم ${ev} · متابعة ${fu}</td>
          <td class="no-print" style="white-space:nowrap;"><button class="btn btn-ghost btn-sm" onclick="DataQuality.edit('${m.id}')">تعديل</button> <button class="btn btn-danger btn-sm" onclick="DataQuality.remove('${m.id}')">حذف</button></td></tr>`; }).join('')}</tbody></table></div>`).join('')}</details>` : '';
  const svLabels = { noPhone:['📵','خادم من غير رقم هاتف','' ], badPhone:['⚠️','خادم رقم هاتفه شكله غير صحيح',''], noClass:['🏫','خادم من غير فصل صالح','مهم لربطه بفصله وتقييد الخادم بفصله'], dupCode:['♊','كود خادم مكرر',''] };
  const order = ['dupCode','noClass','noPhone','badPhone','noBirth','badBirth','classMismatch','noCode'];
  const body = `
    <style>.ann-title{text-align:center; margin-bottom:14px;} .ann-title h1{font-size:22px; margin:0 0 4px;} .ann-title p{margin:2px 0; color:var(--ink-soft);}</style>
    <div class="ann-title">${logoImgTag(50)}<h1>🧹 فحص جودة البيانات</h1><p>${esc((DB.settings||{}).churchName||'')}</p></div>
    <div class="stat-grid">
      ${statCard('اكتمال ملفات المخدومين', R.completePct + '%', R.completePct >= 90 ? 'good' : 'accent')}
      ${statCard('المخدومون النشطون اللي اتفحصوا', R.activeCount, '')}
      ${statCard('ملاحظات على المخدومين', R.memberIssues, R.memberIssues ? 'accent' : 'good')}
      ${statCard('ملاحظات على الخدام', R.servantIssues, R.servantIssues ? 'accent' : 'good')}
    </div>
    ${R.totalIssues === 0 ? `<div class="card card-pad" style="margin-top:14px;">✔ بياناتك مكتملة ومفيش ملاحظات 🎉</div>` : ''}
    ${order.map(k=>section(k, R.cats[k], 'DataQuality.edit', true, LABELS[k])).join('')}
    ${dupNamesHtml}
    ${['dupCode','noClass','noPhone','badPhone'].map(k=>section('sv'+k, R.sv[k], 'DataQuality.editServant', false, svLabels[k])).join('')}
    <p class="muted" style="margin-top:16px; font-size:12.5px;">الفحص بيشمل المخدومين والخدام النشطين بس، ومابيغيّرش أي بيانات بنفسه.</p>`;
  document.getElementById('report-output').innerHTML = `
    <div class="card card-pad">
      <div class="section-head no-print" style="justify-content:flex-end;"><div class="toolbar"><button class="btn btn-ghost btn-sm" onclick="Reports.dataQuality()">🔄 إعادة الفحص</button><button class="btn btn-gold btn-sm" onclick="window.print()">طباعة / حفظ PDF</button></div></div>
      ${body}
    </div>`;
  const out = document.getElementById('report-output'); if(!noScroll && out.scrollIntoView) out.scrollIntoView({behavior:'smooth', block:'start'});
};

/* ---------- التقرير السنوي ---------- */
/* الفترات الجاهزة: العام الدراسي بيبدأ 1 سبتمبر وينتهي 31 أغسطس. النصوص YYYY-MM-DD (من غير Date عشان مايحصلش لخبطة مناطق زمنية) */
Reports.annualRange = function(preset){
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;   // سنة بداية العام الدراسي الحالي
  if(preset === 'school-1') return [`${y-1}-09-01`, `${y}-08-31`];
  if(preset === 'cal0') return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
  return [`${y}-09-01`, `${y+1}-08-31`];   // school0
};
Reports.annualLabel = function(preset, from, to){
  if(preset === 'school0' || preset === 'school-1') return 'العام الدراسي ' + from.slice(0,4) + '/' + to.slice(0,4);
  return 'من ' + fmtDate(from) + ' إلى ' + fmtDate(to);
};
/* حساب كل أرقام التقرير من بيانات الكنيسة (دالة صافية — بتاخد from/to وبترجّع كائن، من غير أي رسم) */
Reports.annualData = function(from, to){
  const d10 = v => String(v||'').slice(0,10);
  const inR = v => { const x = d10(v); return !!x && x >= from && x <= to; };
  const pct = (a,b) => b ? Math.round(a/b*100) : 0;
  const att = DB.attendance.filter(a=>inR(a.date));
  const present = att.filter(a=>a.present).length;
  const sessionDates = [...new Set(att.map(a=>d10(a.date)))].sort();

  // الشهور من from لـ to (بحساب أرقام صحيحة مش Date)
  let [fy, fm] = from.split('-').map(Number); const [ty, tm] = to.split('-').map(Number);
  const months = [];
  while(fy < ty || (fy === ty && fm <= tm)){
    const key = fy + '-' + String(fm).padStart(2,'0');
    const recs = att.filter(a=>d10(a.date).slice(0,7) === key);
    const p = recs.filter(a=>a.present).length;
    months.push({ key, label: new Date(fy, fm-1, 15).toLocaleDateString('ar-EG',{month:'long', year:'numeric'}),
      short: new Date(fy, fm-1, 15).toLocaleDateString('ar-EG',{month:'short'}),
      sessions: new Set(recs.map(a=>d10(a.date))).size, present: p, absent: recs.length - p, total: recs.length, pct: pct(p, recs.length) });
    if(++fm > 12){ fm = 1; fy++; }
    if(months.length > 60) break;
  }

  // حسب الفصل
  const byClass = DB.classes.map(c=>{
    const recs = att.filter(a=>a.classId === c.id); const p = recs.filter(a=>a.present).length;
    return { stage: nameOf(DB.stages, c.stageId), name: c.name, members: DB.members.filter(m=>m.classId===c.id && m.status!=='inactive').length,
      sessions: new Set(recs.map(a=>d10(a.date))).size, total: recs.length, pct: pct(p, recs.length), hasData: recs.length>0 };
  }).filter(r=>r.members>0 || r.hasData).sort((a,b)=> a.stage.localeCompare(b.stage,'ar') || a.name.localeCompare(b.name,'ar'));

  // الملتزمون / الأقل حضورًا (بشرط 3 سجلات على الأقل عشان النسبة تبقى ذات معنى)
  const per = {};
  att.forEach(a=>{ const p = per[a.memberId] || (per[a.memberId] = {present:0,total:0}); p.total++; if(a.present) p.present++; });
  const list = Object.keys(per).map(id=>{ const m = byId(DB.members,id); return m ? {id, name:m.name, cls:nameOf(DB.classes,m.classId), ...per[id], pct: pct(per[id].present, per[id].total)} : null; })
    .filter(x=>x && x.total >= 3);
  const top = [...list].sort((a,b)=> b.pct-a.pct || b.present-a.present).slice(0,10);
  const low = [...list].filter(x=>x.pct < 75).sort((a,b)=> a.pct-b.pct || b.total-a.total).slice(0,10);

  // التقييمات
  const evs = DB.evaluations.filter(e=>inR(e.date));
  const crit = {}; let allSum = 0, allCnt = 0;
  evs.forEach(e=>Object.entries(e.scores||{}).forEach(([k,v])=>{ const n = Number(v); if(isNaN(n)) return; const c = crit[k] || (crit[k]={sum:0,cnt:0}); c.sum+=n; c.cnt++; allSum+=n; allCnt++; }));
  const criteria = Object.keys(crit).map(k=>({name: EVAL_LABELS[k] || k, avg:(crit[k].sum/crit[k].cnt).toFixed(1), cnt:crit[k].cnt})).sort((a,b)=>b.avg-a.avg);

  // المتابعة والأنشطة
  const fups = DB.followups.filter(f=>inR(f.date)); const fupTypes = {};
  fups.forEach(f=>{ const t = f.type || 'غير محدد'; fupTypes[t] = (fupTypes[t]||0)+1; });
  const acts = DB.activities.filter(a=>inR(a.date)).sort((a,b)=>d10(a.date).localeCompare(d10(b.date)));

  const newMembers = DB.members.filter(m=>{ if(!m.createdAt) return false; const c = new Date(m.createdAt); return !isNaN(c) && inR(c.getFullYear()+'-'+String(c.getMonth()+1).padStart(2,'0')+'-'+String(c.getDate()).padStart(2,'0')); }).length;
  const withData = months.filter(m=>m.total>0);
  return {
    from, to, attTotal: att.length, present, absent: att.length - present, pct: pct(present, att.length),
    sessions: sessionDates.length, avgPerSession: sessionDates.length ? Math.round(present / sessionDates.length) : 0,
    activeMembers: DB.members.filter(m=>m.status!=='inactive').length, newMembers,
    servants: DB.servants.filter(s=>s.status!=='inactive').length,
    months, byClass, top, low, evalCount: evs.length, evalAvg: allCnt ? (allSum/allCnt).toFixed(1) : '—', criteria,
    lessons: Reports.lessonRows(from, to, ''),
    actFin: acts.reduce((o, a)=>{ const f = actFinance(a); o.collected += f.collected; o.expected += f.expected; o.expenses += f.expenses; o.any = o.any || f.hasFinance; return o; }, {collected:0, expected:0, expenses:0, any:false}),
    fupCount: fups.length, fupOpen: fups.filter(fupIsOpen).length, fupTypes, acts, actParticipations: acts.reduce((a,x)=>a+(x.participants||[]).length,0),
    bestMonth: withData.length ? withData.reduce((a,b)=>b.pct>a.pct?b:a) : null,
    worstMonth: withData.length > 1 ? withData.reduce((a,b)=>b.pct<a.pct?b:a) : null,
  };
};
/* رسم أعمدة نسبة الحضور الشهرية (SVG مباشر: بيتطبع صح من غير "Background graphics"، والشهور من اليمين لليسار) */
Reports._annualChart = function(months){
  const W = 640, H = 210, padT = 22, padB = 30, plotH = H - padT - padB;
  const step = W / Math.max(months.length, 1), bw = Math.min(step * 0.6, 46);
  const bars = months.map((m,i)=>{
    const cx = W - (i + 0.5) * step, h = m.total ? Math.max(2, plotH * m.pct / 100) : 0, y = padT + plotH - h;
    return (m.total
      ? `<rect x="${(cx-bw/2).toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" style="fill:var(--navy);"/><text x="${cx.toFixed(1)}" y="${(y-5).toFixed(1)}" text-anchor="middle" font-size="11" style="fill:var(--ink);">${m.pct}%</text>`
      : `<text x="${cx.toFixed(1)}" y="${(padT+plotH-4).toFixed(1)}" text-anchor="middle" font-size="11" style="fill:var(--ink-soft);">—</text>`)
      + `<text x="${cx.toFixed(1)}" y="${H-10}" text-anchor="middle" font-size="11" style="fill:var(--ink-soft);">${esc(m.short)}</text>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px; display:block; margin:0 auto;" role="img" aria-label="نسبة الحضور الشهرية">
    <line x1="0" y1="${padT+plotH}" x2="${W}" y2="${padT+plotH}" style="stroke:var(--line);" stroke-width="1"/>${bars}</svg>`;
};
Reports.annual = function(preset){
  const fEl = document.getElementById('ann-from'), tEl = document.getElementById('ann-to');
  let from, to;
  if(preset && preset !== 'custom'){ [from, to] = Reports.annualRange(preset); }
  else if(fEl && tEl && fEl.value && tEl.value){ from = fEl.value; to = tEl.value; preset = 'custom'; }
  else { [from, to] = Reports.annualRange('school0'); preset = 'school0'; }
  if(from > to){ const t = from; from = to; to = t; }
  const D = Reports.annualData(from, to);
  const S = DB.settings || {};
  const label = Reports.annualLabel(preset, from, to);
  const sel = v => preset === v ? 'selected' : '';
  const controls = `<select id="ann-preset" onchange="Reports.annual(this.value)">
      <option value="school0" ${sel('school0')}>العام الدراسي الحالي</option><option value="school-1" ${sel('school-1')}>العام الدراسي اللي فات</option>
      <option value="cal0" ${sel('cal0')}>السنة الميلادية الحالية</option><option value="custom" ${sel('custom')}>فترة مخصصة</option></select>
    <input type="date" id="ann-from" value="${from}" onchange="Reports.annual('custom')"><span class="muted">إلى</span><input type="date" id="ann-to" value="${to}" onchange="Reports.annual('custom')">`;
  const summary = D.attTotal
    ? `على مدار <b>${D.sessions}</b> اجتماع، بلغت نسبة الحضور العامة <b>${D.pct}%</b> بمتوسط <b>${D.avgPerSession}</b> حاضر في الاجتماع.`
      + (D.bestMonth ? ` أعلى شهر حضورًا: <b>${esc(D.bestMonth.label)}</b> (${D.bestMonth.pct}%).` : '')
      + (D.worstMonth ? ` وأقل شهر: <b>${esc(D.worstMonth.label)}</b> (${D.worstMonth.pct}%).` : '')
    : 'مفيش بيانات حضور مسجّلة في الفترة دي.';
  const th = h => `<thead><tr>${h.map(x=>`<th>${x}</th>`).join('')}</tr></thead>`;
  const empty = (n, t) => `<tr><td colspan="${n}" class="muted">${t}</td></tr>`;
  const body = `
    <style>
      .ann-sec{margin-top:22px; break-inside:avoid;} .ann-sec tr{break-inside:avoid;} .ann-sec h3{break-after:avoid;} .ann-sec.ann-long{break-inside:auto;}
      .ann-sec h3{font-size:15px; margin:0 0 10px; padding-bottom:6px; border-bottom:2px solid var(--line);}
      .ann-title{text-align:center; margin-bottom:18px;} .ann-title h1{font-size:22px; margin:0 0 4px;} .ann-title p{margin:2px 0; color:var(--ink-soft);}
      .ann-two{display:grid; grid-template-columns:1fr 1fr; gap:16px;}
      .ann-summary{background:var(--paper-2); border:1px solid var(--line); border-radius:10px; padding:12px 16px; line-height:1.9;}
      .ann-sign{display:none; justify-content:space-between; margin-top:30px; break-inside:avoid;} .ann-sign div{width:40%; text-align:center; border-top:1px solid var(--ink-soft); padding-top:6px; color:var(--ink-soft);}
      @media print{ .ann-sign{display:flex;} .ann-two{grid-template-columns:1fr 1fr;} }
    </style>
    <div class="ann-title">
      ${logoImgTag(50)}
      <h1>التقرير السنوي</h1>
      <p>${esc(S.churchName||'')}${S.schoolName ? ' — ' + esc(S.schoolName) : ''}</p>
      <p><b>${esc(label)}</b></p>
    </div>
    <div class="stat-grid">
      ${statCard('المخدومون النشطون (حاليًا)', D.activeMembers, '')}
      ${statCard('مخدومون جدد في الفترة', D.newMembers, 'accent')}
      ${statCard('عدد الاجتماعات', D.sessions, '')}
      ${statCard('متوسط الحضور في الاجتماع', D.avgPerSession, '')}
      ${statCard('نسبة الحضور العامة', D.pct + '%', 'good')}
      ${statCard('الخدام', D.servants, '')}
      ${statCard('الأنشطة', D.acts.length, '')}
      ${statCard('سجلات المتابعة', D.fupCount, '')}
    </div>
    <div class="ann-summary">${summary}</div>

    <div class="ann-sec ann-long"><h3>الحضور شهريًا</h3>
      <div style="break-inside:avoid;">${D.attTotal ? Reports._annualChart(D.months) : ''}</div>
      <table style="margin-top:12px;">${th(['الشهر','الاجتماعات','حضور','غياب','النسبة'])}<tbody>
        ${D.months.map(m=>`<tr><td>${esc(m.label)}</td><td>${m.sessions}</td><td>${m.present}</td><td>${m.absent}</td><td>${m.total ? m.pct + '%' : '—'}</td></tr>`).join('')}
        <tr style="font-weight:800; background:var(--paper);"><td>الإجمالي</td><td>${D.sessions}</td><td>${D.present}</td><td>${D.absent}</td><td>${D.attTotal ? D.pct + '%' : '—'}</td></tr>
      </tbody></table>
    </div>

    <div class="ann-sec ann-long"><h3>الحضور حسب الفصول</h3>
      <table>${th(['المرحلة','الفصل','عدد المخدومين','الاجتماعات','النسبة'])}<tbody>
        ${D.byClass.length ? D.byClass.map(r=>`<tr><td>${esc(r.stage)}</td><td>${esc(r.name)}</td><td>${r.members}</td><td>${r.sessions}</td><td>${r.total ? r.pct + '%' : '—'}</td></tr>`).join('') : empty(5,'لا توجد فصول.')}
      </tbody></table>
    </div>

    <div class="ann-sec"><div class="ann-two">
      <div><h3>🏅 الأكثر التزامًا بالحضور</h3><table>${th(['المخدوم','الفصل','النسبة'])}<tbody>
        ${D.top.length ? D.top.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.cls)}</td><td>${x.pct}% <span class="muted">(${x.present}/${x.total})</span></td></tr>`).join('') : empty(3,'مفيش بيانات كافية (3 سجلات حضور على الأقل).')}
      </tbody></table></div>
      <div><h3>🔎 الأقل حضورًا (محتاجين افتقاد)</h3><table>${th(['المخدوم','الفصل','النسبة'])}<tbody>
        ${D.low.length ? D.low.map(x=>`<tr><td>${esc(x.name)}</td><td>${esc(x.cls)}</td><td>${x.pct}% <span class="muted">(${x.present}/${x.total})</span></td></tr>`).join('') : empty(3,'مفيش مخدومين تحت 75% 🎉')}
      </tbody></table></div>
    </div></div>

    <div class="ann-sec"><div class="ann-two">
      <div><h3>⭐ التقييمات</h3>
        <p style="margin:0 0 8px;">عدد التقييمات: <b>${D.evalCount}</b> · المتوسط العام: <b>${D.evalAvg}</b></p>
        <table>${th(['المعيار','المتوسط'])}<tbody>${D.criteria.length ? D.criteria.map(c=>`<tr><td>${esc(c.name)}</td><td>${c.avg}</td></tr>`).join('') : empty(2,'لا توجد تقييمات في الفترة.')}</tbody></table></div>
      <div><h3>🗂️ المتابعة الفردية</h3>
        <p style="margin:0 0 8px;">إجمالي سجلات المتابعة: <b>${D.fupCount}</b>${D.fupOpen ? ` · لسه مفتوحة: <b>${D.fupOpen}</b>` : ''}</p>
        <table>${th(['النوع','العدد'])}<tbody>${Object.keys(D.fupTypes).length ? Object.entries(D.fupTypes).sort((a,b)=>b[1]-a[1]).map(([t,n])=>`<tr><td>${esc(t)}</td><td>${n}</td></tr>`).join('') : empty(2,'لا توجد سجلات متابعة في الفترة.')}</tbody></table></div>
    </div></div>

    <div class="ann-sec ann-long" style="break-after:avoid;"><h3>🎉 الأنشطة (${D.acts.length}) — إجمالي المشاركات: ${D.actParticipations}</h3>
      ${D.actFin.any ? `<p style="margin:0 0 8px;">إجمالي المحصّل: <b>${fmtMoney(D.actFin.collected)}</b> · المصروفات: <b>${fmtMoney(D.actFin.expenses)}</b> · الصافي: <b>${fmtMoney(D.actFin.collected - D.actFin.expenses)}</b></p>` : ''}
      <table>${th(['التاريخ','النشاط','المكان','المشاركون', ...(D.actFin.any ? ['المحصّل','المصروفات'] : [])])}<tbody>
        ${D.acts.length ? D.acts.map(a=>{ const f = actFinance(a); return `<tr><td>${fmtDate(a.date)}</td><td>${esc(a.name)}</td><td>${esc(a.place||'—')}</td><td>${(a.participants||[]).length}</td>${D.actFin.any ? `<td>${f.hasFinance ? fmtNum(f.collected) : '—'}</td><td>${f.hasFinance ? fmtNum(f.expenses) : '—'}</td>` : ''}</tr>`; }).join('') : empty(D.actFin.any ? 6 : 4,'لا توجد أنشطة في الفترة.')}
      </tbody></table>
    </div>

    ${D.lessons.length ? `<div class="ann-sec ann-long"><h3>📖 المنهج (${D.lessons.length} درس)</h3>
      <table>${th(['التاريخ','المرحلة','الدرس','الآية / الحفظ','الحضور'])}<tbody>
        ${D.lessons.map(l=>`<tr><td>${fmtDate(l.date)}</td><td>${esc(nameOf(DB.stages,l.stageId))}</td><td>${esc(l.title)}</td><td class="muted">${esc(l.verse||'—')}</td><td>${l.pct === null ? '—' : l.pct + '%'}</td></tr>`).join('')}
      </tbody></table></div>` : ''}

    <div class="ann-sign"><div>أمين الخدمة</div><div>الاعتماد</div></div>
    <p class="muted" style="margin-top:14px; font-size:12px;">تم إنشاء التقرير بتاريخ ${fmtDate(todayISO())}${CURRENT_USER ? ' بواسطة ' + esc(CURRENT_USER.name) : ''}.</p>
  `;
  document.getElementById('report-output').innerHTML = `
    <div class="card card-pad">
      <div class="section-head no-print" style="justify-content:flex-end;"><div class="toolbar">${controls}<button class="btn btn-gold btn-sm" onclick="window.print()">طباعة / حفظ PDF</button></div></div>
      ${body}
    </div>`;
  const out = document.getElementById('report-output'); if(out && out.scrollIntoView) out.scrollIntoView({behavior:'smooth', block:'start'});
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
  document.getElementById('users-table-wrap').innerHTML = uRows.length ? `<table><thead><tr><th>الاسم</th><th>البريد الإلكتروني</th><th>الدور</th><th>الخادم المرتبط</th><th></th></tr></thead>
    <tbody>${uRows.map(u=>`<tr><td class="name-cell"><span class="avatar">${u.photo?`<img src="${u.photo}" data-photo="${u.photo}" onclick="previewAvatarClick(event)" style="cursor:zoom-in;">`:initials(u.name)}</span>${esc(u.name)}</td><td class="muted">${esc(u.email)}</td><td>${ROLE_LABELS[u.role]||u.role}</td><td>${u.servantId && byId(DB.servants,u.servantId) ? esc(byId(DB.servants,u.servantId).name) : '<span class="muted">—</span>'}</td>
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
      <div class="field full"><label>سجل الخادم المرتبط بالحساب (بيتستخدم في "مهامي" وتقييد الخادم بفصله)</label>
        <select id="f-servant-link"><option value="">— غير مرتبط —</option>${DB.servants.map(sv=>`<option value="${sv.id}" ${u.servantId===sv.id?'selected':''}>${esc(sv.name)}${sv.classId?' — '+esc(nameOf(DB.classes,sv.classId)):''}</option>`).join('')}</select></div>
    </div>
  `, `<button class="btn btn-primary" onclick="UsersV.save('${id}')">حفظ</button><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>`);
};
UsersV.save = async function(id){
  const role = document.getElementById('f-role').value;
  const photo = document.getElementById('f-photo-data').value;
  const code = document.getElementById('f-code').value.trim();
  const servantId = document.getElementById('f-servant-link').value;
  try{
    await fsUpdate('users', id, {role, photo, code, servantId});
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
/* صفحة الإعدادات مقسّمة تبويبات (عام/الأمان/واتساب/قوائم المهام/السجل) بعد ما بقت طويلة أوي كصفحة واحدة.
   نفس نمط تبويبات بروفايل المخدوم بالظبط: تبويب نشط في متغيّر واحد + إعادة رسم الصفحة كاملة (App.navigate) عند التبديل. */
let CURRENT_SETTINGS_TAB = 'general';
Views.settings = function(){
  const s = DB.settings;
  const _T = CURRENT_SETTINGS_TAB;
  const _tabs = [['general','⚙️ عام'],['security','🔒 الأمان'],['whatsapp','💬 قوالب واتساب'],['lists','📋 قوائم المهام'],['log','📜 سجل العمليات']];
  let filteredLog = DB.auditLog||[];
  if(CHURCH_LOG_FILTERS.from) filteredLog = filteredLog.filter(l=> l.date && l.date.slice(0,10) >= CHURCH_LOG_FILTERS.from);
  if(CHURCH_LOG_FILTERS.to) filteredLog = filteredLog.filter(l=> l.date && l.date.slice(0,10) <= CHURCH_LOG_FILTERS.to);
  $content().innerHTML = `
    <div class="section-head"><h2>إعدادات النظام</h2></div>
    <div class="tabs no-print">${_tabs.map(([k,l])=>`<button class="tab-btn ${_T===k?'active':''}" onclick="SettingsV.setTab('${k}')">${l}</button>`).join('')}</div>
    <div class="tab-panel ${_T==='general'?'active':''}">
    <div class="card card-pad" style="max-width:560px; margin-bottom:16px;">
      <b style="font-size:13px; display:block; margin-bottom:8px;">🔔 إشعارات المتصفح</b>
      <p class="muted" style="margin:0 0 10px;">هتوصلك إشعار فوري لما يجيلك رد شات أو تذكرة جديدة، حتى لو التاب فاتح فى الخلفية.</p>
      <button class="btn btn-primary btn-sm" onclick="enableBrowserNotifications()">${window.Notification && Notification.permission==='granted' ? '✅ الإشعارات مفعّلة' : '🔔 تفعيل الإشعارات'}</button>
    </div>
    <div class="card card-pad" style="max-width:560px;">
      <div class="form-grid">
        <div class="field full"><label>اسم الكنيسة</label><input id="s-church" value="${esc(s.churchName||'')}"></div>
        <div class="field full"><label>اسم مدرسة الأحد</label><input id="s-school" value="${esc(s.schoolName||'')}"></div>
        <div class="field full"><label>بيانات التواصل</label><input id="s-contact" value="${esc(s.contact||'')}"></div>
      </div>
      <button class="btn btn-primary" style="margin-top:14px;" onclick="SettingsV.save()">حفظ الإعدادات</button>
    </div>

    <div class="section-head" style="margin-top:26px;"><h2>🖼️ الهوية البصرية</h2></div>
    <div class="card card-pad" style="max-width:760px; margin-bottom:10px;">
      <div class="info-card-grid">
        <div>
          <b style="font-size:13px; display:block; margin-bottom:6px;">شعار الكنيسة</b>
          <p class="muted" style="margin:0 0 8px; font-size:12.5px;">بيظهر أعلى التقارير وكشوف الطباعة.</p>
          <div id="s-logo-preview" style="width:100%; max-width:200px; height:90px; border:1px dashed var(--line); border-radius:10px; display:flex; align-items:center; justify-content:center; background:var(--paper); margin-bottom:8px; overflow:hidden;">
            ${s.churchLogo ? `<img src="${esc(s.churchLogo)}" style="max-width:100%; max-height:100%; object-fit:contain;">` : '<span class="muted" style="font-size:12px;">مفيش شعار</span>'}
          </div>
          <input type="file" id="s-logo-file" accept="image/*" style="display:none;" onchange="SettingsV.uploadImage('logo', this.files[0])">
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('s-logo-file').click()">📷 ${s.churchLogo?'تغيير الشعار':'رفع شعار'}</button>
          ${s.churchLogo ? `<button type="button" class="btn btn-danger btn-sm" onclick="SettingsV.removeImage('logo')">🗑 إزالة</button>` : ''}
        </div>
        <div>
          <b style="font-size:13px; display:block; margin-bottom:6px;">صورة الكنيسة</b>
          <p class="muted" style="margin:0 0 8px; font-size:12.5px;">بتظهر جنب اسم الكنيسة في القائمة الجانبية.</p>
          <div id="s-photo-preview" style="width:100%; max-width:200px; height:90px; border:1px dashed var(--line); border-radius:10px; display:flex; align-items:center; justify-content:center; background:var(--paper); margin-bottom:8px; overflow:hidden;">
            ${s.churchPhoto ? `<img src="${esc(s.churchPhoto)}" style="max-width:100%; max-height:100%; object-fit:cover;">` : '<span class="muted" style="font-size:12px;">مفيش صورة</span>'}
          </div>
          <input type="file" id="s-photo-file" accept="image/*" style="display:none;" onchange="SettingsV.uploadImage('photo', this.files[0])">
          <button type="button" class="btn btn-ghost btn-sm" onclick="document.getElementById('s-photo-file').click()">📷 ${s.churchPhoto?'تغيير الصورة':'رفع صورة'}</button>
          ${s.churchPhoto ? `<button type="button" class="btn btn-danger btn-sm" onclick="SettingsV.removeImage('photo')">🗑 إزالة</button>` : ''}
        </div>
      </div>
      <p class="muted" style="margin:12px 0 0; font-size:12px;">بيتخزنوا مع باقي بيانات الكنيسة، فبيدخلوا في النسخة الاحتياطية تلقائيًا.</p>
    </div>

    </div>

    <div class="tab-panel ${_T==='security'?'active':''}">
    ${Scope.settingsCardHtml()}
    <div class="section-head" style="margin-top:26px;"><h2>⏳ تسجيل خروج تلقائي بعد خمول</h2></div>
    <div class="card card-pad" style="max-width:760px; margin-bottom:10px;">
      <p class="muted" style="margin:0 0 10px;">لو محدّش استخدم النظام لمدة معيّنة، بيتم تسجيل خروجه تلقائيًا. مفيد للأجهزة المشتركة (زي جهاز وضع الاستقبال). صفر أو فاضي = متوقف.</p>
      <div class="form-grid"><div class="field"><label>الخمول بالدقايق (0 = متوقف)</label><input type="number" id="set-idle-minutes" min="0" step="1" value="${(DB.settings||{}).idleLogoutMinutes || ''}"></div></div>
      <button class="btn btn-primary btn-sm" onclick="SettingsV.saveIdleLogout()">حفظ</button>
    </div>

    </div>

    <div class="tab-panel ${_T==='whatsapp'?'active':''}">
    <div class="section-head" style="margin-top:26px;"><h2>💬 قوالب رسائل واتساب</h2></div>
    <div class="card card-pad" style="max-width:760px; margin-bottom:10px;">
      <p class="muted" style="margin:0 0 6px;">عدّل صياغة الرسائل الجاهزة اللي بتظهر عند الضغط على 💬 جنب المخدوم. الكلمات بين الأقواس بتتبدّل تلقائيًا ببيانات المخدوم:</p>
      <p style="margin:0 0 14px; line-height:2;">${WA_PLACEHOLDERS.map(p=>`<span class="pill status-pending" title="${esc(p[1])}" style="margin-left:4px;">${esc(p[0])}</span>`).join('')}</p>
      ${WA_TEMPLATES.map(t=>`
        <div class="field full" style="margin-bottom:12px;">
          <label>${t.ic} ${esc(t.label)} <a style="cursor:pointer; font-size:12px; margin-right:8px; color:var(--absent);" onclick="SettingsV.resetWaTemplate('${t.key}')">استرجاع الافتراضي</a></label>
          <textarea id="wa-set-${t.key}" rows="3">${esc(WA.getTemplate(t.key))}</textarea>
        </div>`).join('')}
      <button class="btn btn-primary" onclick="SettingsV.saveWaTemplates()">حفظ القوالب</button>
    </div>

    </div>

    <div class="tab-panel ${_T==='lists'?'active':''}">
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
    </div>

    <div class="tab-panel ${_T==='log'?'active':''}">
    <div class="section-head" style="margin-top:26px;"><h2>سجل العمليات</h2></div>
    <div class="card card-pad" style="margin-bottom:12px;">
      <div class="toolbar">
        <div class="field" style="margin:0;"><label>من تاريخ</label><input type="date" id="log-f-from" value="${CHURCH_LOG_FILTERS.from}"></div>
        <div class="field" style="margin:0;"><label>إلى تاريخ</label><input type="date" id="log-f-to" value="${CHURCH_LOG_FILTERS.to}"></div>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; margin-top:10px;">
        <button class="btn btn-ghost btn-sm" onclick="SettingsV.resetLogFilters()">إعادة تعيين (الشهر الحالي)</button>
        <button class="btn btn-primary btn-sm" onclick="SettingsV.applyLogFilters()">عرض السجل</button>
      </div>
    </div>
    <div class="card"><table><thead><tr><th>التاريخ</th><th>المستخدم</th><th>العملية</th><th>التفاصيل</th></tr></thead>
    <tbody>${filteredLog.length ? filteredLog.slice(0,300).map(l=>`<tr><td>${fmtDate(l.date)}</td><td>${esc(l.user)}</td><td>${esc(l.action)}</td><td class="muted">${esc(l.details)}</td></tr>`).join('') : `<tr><td colspan="4" class="muted">لا توجد عمليات مسجلة فى هذه الفترة</td></tr>`}</tbody></table></div>
    </div>
  `;
};
let CHURCH_LOG_FILTERS = {from: monthStartISO(), to:''};
const SettingsV = {};
SettingsV.setTab = function(tab){ CURRENT_SETTINGS_TAB = tab; App.navigate('settings'); };
SettingsV.applyLogFilters = function(){
  CHURCH_LOG_FILTERS = { from: document.getElementById('log-f-from').value, to: document.getElementById('log-f-to').value };
  Views.settings();
};
SettingsV.resetLogFilters = function(){ CHURCH_LOG_FILTERS = {from: monthStartISO(), to:''}; Views.settings(); };
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
SettingsV.uploadImage = async function(kind, file){
  if(!file) return;
  const field = kind === 'logo' ? 'churchLogo' : 'churchPhoto';
  try{
    const img = await smartImageUpload(file, kind === 'logo' ? 500 : 700, 0.75);
    await fsSet('settings', CURRENT_CHURCH_ID, {[field]: img});
    await log(kind === 'logo' ? 'تحديث شعار الكنيسة' : 'تحديث صورة الكنيسة', '');
    toast('تم الحفظ');
    App.navigate('settings');
  }catch(e){ console.error(e); toast('تعذر رفع الصورة: ' + e.message); }
};
SettingsV.removeImage = async function(kind){
  const field = kind === 'logo' ? 'churchLogo' : 'churchPhoto';
  if(!confirm(kind === 'logo' ? 'إزالة الشعار؟' : 'إزالة الصورة؟')) return;
  try{
    await fsSet('settings', CURRENT_CHURCH_ID, {[field]: ''});
    await log(kind === 'logo' ? 'إزالة شعار الكنيسة' : 'إزالة صورة الكنيسة', '');
    toast('تمت الإزالة');
    App.navigate('settings');
  }catch(e){ console.error(e); toast('تعذر الحذف: ' + e.message); }
};
SettingsV.saveIdleLogout = async function(){
  const mins = Math.max(0, Math.round(Number(document.getElementById('set-idle-minutes').value) || 0));
  try{
    await fsSet('settings', CURRENT_CHURCH_ID, {idleLogoutMinutes: mins});
    await log('تعديل مهلة الخروج التلقائي', mins ? mins+' دقيقة' : 'إيقاف');
    toast(mins ? 'تم الحفظ — الخروج التلقائي بعد '+mins+' دقيقة خمول' : 'تم إيقاف الخروج التلقائي');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); }
};
SettingsV.setRestrictServants = async function(checked){
  const cb = document.getElementById('set-restrict');
  const unlinked = (DB.users||[]).filter(u=>u.role === 'servant' && (!u.servantId || !byId(DB.servants,u.servantId)));
  if(checked && unlinked.length && !confirm(`فيه ${unlinked.length} حساب خادم مش مربوط بسجل خادم (${unlinked.map(u=>u.name).join('، ')}). هيشوفوا صفحات فاضية لحد ما تربطهم. تشغّل التقييد برضه؟`)){ if(cb) cb.checked = false; return; }
  try{
    await fsSet('settings', CURRENT_CHURCH_ID, {restrictServants: !!checked});
    await log(checked ? 'تشغيل تقييد الخادم بفصله' : 'إيقاف تقييد الخادم بفصله','');
    toast(checked ? 'تم تشغيل تقييد الخادم بفصله' : 'تم إيقاف التقييد');
  }catch(e){ console.error(e); toast('تعذر الحفظ: '+e.message); if(cb) cb.checked = !checked; }
};
SettingsV.resetWaTemplate = function(key){
  const def = WA_TEMPLATES.find(t=>t.key===key); const ta = document.getElementById('wa-set-'+key);
  if(def && ta){ ta.value = def.text; toast('اتسترجع النص الافتراضي — اضغط "حفظ القوالب" لتأكيده'); }
};
SettingsV.saveWaTemplates = async function(){
  const data = {};
  WA_TEMPLATES.forEach(t=>{
    const v = (document.getElementById('wa-set-'+t.key)||{value:''}).value;
    data[t.key] = (v.trim() && v !== t.text) ? v : ''; // الفاضي أو المطابق للافتراضي = افتراضي
  });
  try{
    await fsSet('settings', CURRENT_CHURCH_ID, {waTemplates: data});
    await log('تعديل قوالب واتساب','');
    toast('تم حفظ قوالب واتساب');
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

    <div class="section-head" style="margin-top:22px;"><h2>نسخ احتياطية منفصلة (Excel/CSV)</h2></div>
    <div class="info-card-grid">
      <div class="card card-pad">
        <h3 style="font-size:14px;">المخدومون</h3>
        <button class="btn btn-primary btn-sm" onclick="Members.exportCSV()">⬇️ تصدير المخدومين (CSV)</button>
        <div style="margin-top:10px;">
          <input type="file" id="members-restore-input" accept=".csv" style="display:none;" onchange="Members.importCSV(this.files[0], this)">
          <button class="btn btn-danger btn-sm" onclick="document.getElementById('members-restore-input').click()">⬆️ استرداد من ملف CSV</button>
        </div>
      </div>
      <div class="card card-pad">
        <h3 style="font-size:14px;">الخدام</h3>
        <button class="btn btn-primary btn-sm" onclick="Servants.exportCSV()">⬇️ تصدير الخدام (CSV)</button>
        <div style="margin-top:10px;">
          <input type="file" id="servants-restore-input" accept=".csv" style="display:none;" onchange="Servants.importCSV(this.files[0], this)">
          <button class="btn btn-danger btn-sm" onclick="document.getElementById('servants-restore-input').click()">⬆️ استرداد من ملف CSV</button>
        </div>
      </div>
    </div>
  `;
};
const BackupV = {};
/* ---------- سلة المحذوفات (Members/Servants/Activities) ---------- */
const TrashV = {};
Views.trash = function(){
  $content().innerHTML = `<div class="section-head"><h2>🗑️ سلة المحذوفات</h2></div><p class="muted">جاري التحميل...</p>`;
  TrashV.load();
};
TrashV.load = async function(){
  try{
    const [mSnap, sSnap, aSnap] = await Promise.all([
      getDocs(query(collection(dbFire,'members'), where('churchId','==',CURRENT_CHURCH_ID))),
      getDocs(query(collection(dbFire,'servants'), where('churchId','==',CURRENT_CHURCH_ID))),
      getDocs(query(collection(dbFire,'activities'), where('churchId','==',CURRENT_CHURCH_ID))),
    ]);
    const THIRTY_DAYS = 30*86400000;
    const now = Date.now();
    const purge = [];
    const members = mSnap.docs.map(d=>({id:d.id, ...d.data()})).filter(x=>x.deletedAt).filter(x=>{
      if(now-x.deletedAt>THIRTY_DAYS){ purge.push(['members',x.id]); return false; } return true;
    });
    const servants = sSnap.docs.map(d=>({id:d.id, ...d.data()})).filter(x=>x.deletedAt).filter(x=>{
      if(now-x.deletedAt>THIRTY_DAYS){ purge.push(['servants',x.id]); return false; } return true;
    });
    const activities = aSnap.docs.map(d=>({id:d.id, ...d.data()})).filter(x=>x.deletedAt).filter(x=>{
      if(now-x.deletedAt>THIRTY_DAYS){ purge.push(['activities',x.id]); return false; } return true;
    });
    if(purge.length){ await Promise.all(purge.map(([col,id])=>fsDelete(col,id))); } // تنظيف تلقائي لأي حاجة عدّت 30 يوم
    TrashV.render(members, servants, activities);
  }catch(e){ console.error(e); toast('تعذر تحميل سلة المحذوفات: '+e.message); }
};
TrashV.render = function(members, servants, activities){
  const section = (title, items, col, nameField)=> `
    <div class="section-head" style="margin-top:18px;"><h2>${title} (${items.length})</h2></div>
    <div class="card">
      ${items.length ? items.map(x=>`
        <div style="padding:12px 16px; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
          <div><b>${esc(x[nameField]||x.name||'')}</b><div class="muted" style="font-size:11.5px;">اتحذف في ${fmtDate(new Date(x.deletedAt).toISOString())}</div></div>
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm" onclick="TrashV.restore('${col}','${x.id}')">↩ استرجاع</button>
            <button class="btn btn-danger btn-sm" onclick="TrashV.purgeNow('${col}','${x.id}')">🗑 حذف نهائي</button>
          </div>
        </div>
      `).join('') : `<p class="muted" style="padding:16px;">فاضية.</p>`}
    </div>
  `;
  $content().innerHTML = `
    <div class="section-head"><h2>🗑️ سلة المحذوفات</h2></div>
    <p class="muted">أي حاجة هنا بتتحذف نهائيًا تلقائيًا بعد ٣٠ يوم من نقلها هنا.</p>
    ${section('المخدومون', members, 'members', 'name')}
    ${section('الخدام', servants, 'servants', 'name')}
    ${section('الأنشطة', activities, 'activities', 'name')}
  `;
};
TrashV.restore = async function(col, id){
  try{ await updateDoc(doc(dbFire,col,id), {deletedAt: null}); toast('تم الاسترجاع'); TrashV.load(); }
  catch(e){ console.error(e); toast('تعذر الاسترجاع: '+e.message); }
};
TrashV.purgeNow = async function(col, id){
  if(!confirm('حذف نهائي — لن تقدر تسترجعه تاني. متأكد؟')) return;
  try{
    await fsDelete(col, id);
    if(col==='members'){ await Promise.all([fsDeleteWhere('attendance','memberId',id), fsDeleteWhere('evaluations','memberId',id), fsDeleteWhere('followups','memberId',id)]); }
    toast('تم الحذف النهائي'); TrashV.load();
  }catch(e){ console.error(e); toast('تعذر الحذف: '+e.message); }
};
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
    ${CHURCH_ACCESS_LOCKED ? `<div class="card card-pad" style="margin-bottom:16px; background:var(--absent-bg); border-color:#E7C6BE;">
      🔒 انتهى اشتراك الكنيسة، وتم قفل باقي صفحات النظام مؤقتًا. لسه متاح ليك هنا وفى "الدردشة مع الإدارة" و"الدعم الفني والشكاوى" بس. جدّد اشتراكك تحت وهيرجع كل حاجة تشتغل تلقائيًا فورًا.
    </div>` : ''}
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
let CHAT_SESSION = {activeChurchId:null, queue:[]};
const Chat = {};
Views.chat = function(){
  $content().innerHTML = `
    <div class="section-head"><h2>الدردشة مع الإدارة</h2></div>
    <div id="chat-queue-banner"></div>
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
  Chat.renderQueueBanner();
  markChatRead((DB.chatMessages||[]).filter(m=>m.senderRole==='superadmin' && m.readByChurch===false), 'readByChurch');
};
/* بانر "🕐 الأدمن مشغول، انت رقم X في الانتظار" — بيتحدث لحظيًا مع أي تغيير فى الطابور */
Chat.renderQueueBanner = function(){
  const box = document.getElementById('chat-queue-banner');
  if(!box) return;
  const s = CHAT_SESSION;
  if(!s.activeChurchId || s.activeChurchId===CURRENT_CHURCH_ID){
    box.innerHTML = '';
    return;
  }
  const pos = (s.queue||[]).indexOf(CURRENT_CHURCH_ID);
  const posLabel = pos>=0 ? (pos+1) : '—';
  box.innerHTML = `<div class="card card-pad" style="background:#FBF6EC; border-color:#E9D3AE; margin-bottom:12px; font-size:13.5px;">
    🕐 الأدمن بيتكلم مع عميل تاني حاليًا. إنت رقم <b>${posLabel}</b> في قائمة الانتظار، هيوصلك دورك قريب.
  </div>`;
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
  // رسائل أقدم من 30 يوم مابتتعرضش (بتتحذف فعليًا من قاعدة البيانات لما الإدارة تفتح نفس المحادثة — الكنيسة مالهاش صلاحية حذف)
  const cutoff = Date.now() - CHAT_RETENTION_MS;
  const msgs = (DB.chatMessages||[]).filter(m=>(m.createdAt||0) >= cutoff);
  el.innerHTML = msgs.length ? msgs.map(m=>{
    const mine = m.senderRole !== 'superadmin';
    // اسم المالك (أو أي حد من فريق الإدارة) مايظهرش للكنيسة — بيظهر "الإدارة" بدل الاسم الشخصي
    const displayName = mine ? m.senderName : 'الإدارة';
    return `<div style="display:flex; ${mine?'justify-content:flex-start;':'justify-content:flex-end;'} margin-bottom:10px;">
      <div style="max-width:72%; padding:9px 13px; border-radius:12px; font-size:13.5px; ${mine?'background:var(--paper); color:var(--ink);':'background:var(--navy); color:#fff;'}">
        <div style="display:flex; justify-content:space-between; gap:10px; font-size:11px; opacity:.7; margin-bottom:3px;">
          <span>${esc(displayName)}</span>
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
    await Chat.ensureActiveOrQueued();
    const payload = {
      churchId: CURRENT_CHURCH_ID, senderRole: IMPERSONATING?'admin':CURRENT_USER.role, senderName: CURRENT_USER.name,
      text, createdAt: Date.now(), readBySA:false, readByChurch:true,
    };
    if(file) payload.imageBase64 = await smartImageUpload(file, 900, 0.6);
    await fsAddRaw('chatMessages', payload);
    Chat.clearFile();
  }catch(e){ console.error(e); toast('تعذر إرسال الرسالة: '+e.message); }
};
/* نظام الجلسة النشطة/الطابور: أول عميل يبعت رسالة والأدمن فاضي بيبقى نشط تلقائيًا،
   وأي عميل تاني بيتسجّل فى آخر الطابور (لو مش مسجّل فيه بالفعل) */
Chat.ensureActiveOrQueued = async function(){
  const ref = doc(dbFire,'platformConfig','chatSession');
  try{
    const snap = await getDoc(ref);
    const s = snap.exists() ? snap.data() : {activeChurchId:null, queue:[]};
    if(!s.activeChurchId){
      await setDoc(ref, {activeChurchId: CURRENT_CHURCH_ID, queue: (s.queue||[]).filter(id=>id!==CURRENT_CHURCH_ID)}, {merge:true});
    } else if(s.activeChurchId !== CURRENT_CHURCH_ID && !(s.queue||[]).includes(CURRENT_CHURCH_ID)){
      await setDoc(ref, {queue: [...(s.queue||[]), CURRENT_CHURCH_ID]}, {merge:true});
    }
  }catch(e){ console.error('chat session update failed', e); } // مش حرج، الرسالة تتبعت عادي حتى لو فشل تحديث الطابور
};
window.Chat = Chat;

/* ---------- الدعم الفني والشكاوى (نظام التذاكر) ---------- */
const Tickets = {};
const TICKET_STATUS_META = {
  'جديدة': {ic:'🆕', cls:'status-pending'},
  'جاري المتابعة': {ic:'🔄', cls:'status-trial'},
  'قيد التنفيذ': {ic:'⚙️', cls:'status-exempt'},
  'تم التنفيذ': {ic:'✅', cls:'status-active'},
  'مرفوضة': {ic:'❌', cls:'status-expired'},
  'ملغاة': {ic:'🚫', cls:'status-expired'},
};
function ticketStatusPill(status, cancelledByChurch){
  const m = TICKET_STATUS_META[status] || TICKET_STATUS_META['جديدة'];
  return `<span class="pill ${m.cls}">${m.ic} ${esc(status||'جديدة')}</span>${cancelledByChurch? ' <span class="muted" style="font-size:11px;">(من العميل)</span>':''}`;
}
Views.tickets = function(){
  Tickets.render();
  markChatRead((DB.tickets||[]).filter(t=>t.readByChurch===false), 'readByChurch', 'tickets');
};
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
        ${ticketStatusPill(t.status, t.cancelledByChurch)}
      </div>`).join('')}
    </div>` : `<p class="muted">لا توجد تذاكر بعد. لو عندك مشكلة أو شكوى، ابدأ تذكرة جديدة من الزرار اللي فوق.</p>`}
  `;
};
Tickets.openNewForm = async function(){
  // نجيب أنواع التذاكر مباشرة لو لسه المستمع اللحظي مجابش البيانات (يمنع ظهور "عام" بس فى حالة فتح النافذة بسرعة)
  if(!TICKET_TYPES.length){
    try{
      const d = await getDoc(doc(dbFire,'ticketTypes','main'));
      if(d.exists()) TICKET_TYPES = d.data().types||[];
    }catch(e){ console.error(e); }
  }
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
      type, title, description: desc, status:'جديدة', adminReply:'', hasAdminUpdate:false, cancelledByChurch:false,
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
    ${ticketStatusPill(t.status, t.cancelledByChurch)}
    <h3 style="margin:10px 0 4px; font-size:15px;">${esc(t.title)}</h3>
    <p class="muted" style="font-size:11.5px; margin-bottom:10px;">${esc(t.type||'')} · ${new Date(t.createdAt).toLocaleString('ar-EG')}</p>
    <p style="white-space:pre-wrap; font-size:13.5px;">${esc(t.description)}</p>
    ${t.attachmentImg? `<img src="${t.attachmentImg}" style="max-width:160px; border-radius:8px; margin-top:10px; cursor:pointer; border:1px solid var(--line);" onclick="UI.previewImage('${t.attachmentImg.replace(/'/g,"\\'")}')">`:''}
    ${t.hasAdminUpdate? `<div class="card card-pad" style="margin-top:14px; background:var(--paper);">
      <b style="font-size:12.5px; color:var(--navy);">رد الإدارة:</b>
      <p style="font-size:13px; margin-top:6px; white-space:pre-wrap;">${esc(t.adminReply||'')}</p>
    </div>` : ''}
  `, t.status==='جديدة' ? `<button class="btn btn-danger btn-block" onclick="Tickets.cancel('${t.id}')">🚫 إلغاء التذكرة</button>` : '');
};
Tickets.cancel = async function(id){
  if(!confirm('هل تريد إلغاء هذه التذكرة؟')) return;
  try{
    await updateDoc(doc(dbFire,'tickets',id), { status:'ملغاة', cancelledByChurch:true, readBySA:false });
    UI.closeModal();
    toast('تم إلغاء التذكرة');
  }catch(e){ console.error(e); toast('تعذر الإلغاء: '+e.message); }
};
window.Tickets = Tickets;

/* ---------- Global search ---------- */
/* فهرس ثابت لكل ميزات/إعدادات النظام (مش بس بيانات المخدومين) — عشان البحث يوصل لأي حاجة فى أي صفحة */
const CHURCH_SEARCH_INDEX = [
  {label:'بيانات الكنيسة والاسم', page:'settings', keywords:'اسم الكنيسة بيانات وصف'},
  {label:'أسماء الأنشطة الجاهزة', page:'settings', keywords:'اسم نشاط قوالب جاهزة اقتراحات'},
  {label:'أنواع المتابعة', page:'settings', keywords:'نوع متابعة غياب سلوكي روحي دراسي'},
  {label:'النسخ الاحتياطي واستيراد/تصدير البيانات', page:'backup', keywords:'نسخة احتياطية استيراد تصدير csv'},
  {label:'المراحل والصفوف والفصول', page:'stages', keywords:'مرحلة صف دراسي فصل ابتدائي اعدادي ثانوي'},
  {label:'تسجيل الحضور بالباركود/QR', page:'attendance', keywords:'حضور غياب باركود qr قراءة كاميرا'},
  {label:'التقييمات', page:'evaluations', keywords:'تقييم درجة تقييم جديد'},
  {label:'المتابعة الفردية', page:'followups', keywords:'متابعة فردية مشكلة سلوك'},
  {label:'الأنشطة والفعاليات', page:'activities', keywords:'نشاط فعالية رحلة مسابقة مشاركين'},
  {label:'مركز التقارير', page:'reports', keywords:'تقرير كشف حضور فردي إحصائيات'},
  {label:'الاشتراك وطرق الدفع', page:'billing', keywords:'اشتراك دفع فاتورة تجديد باقة'},
  {label:'الدردشة مع الإدارة', page:'chat', adminOnly:true, keywords:'شات دردشة دعم مراسلة الإدارة'},
  {label:'الدعم الفني والشكاوى', page:'tickets', adminOnly:true, keywords:'تذكرة شكوى دعم فني'},
  {label:'المستخدمون والصلاحيات', page:'users', adminOnly:true, keywords:'مستخدم صلاحية دور دعوة خادم أدمن'},
];
App.globalSearch = function(q){
  const box = document.getElementById('search-results');
  q = q.trim().toLowerCase();
  if(!q){ box.style.display='none'; return; }
  const results = [];
  NAV_ITEMS.forEach(it=>{
    if(!it.adminOnly || CURRENT_USER.role==='admin' || IMPERSONATING){
      if(it.label.toLowerCase().includes(q)) results.push({label:it.label, sub:'صفحة', action:`App.navigate('${it.id}')`});
    }
  });
  CHURCH_SEARCH_INDEX.forEach(it=>{
    if(it.adminOnly && !(CURRENT_USER.role==='admin' || IMPERSONATING)) return;
    if(it.label.toLowerCase().includes(q) || (it.keywords||'').toLowerCase().includes(q)){
      results.push({label:it.label, sub:'ميزة/إعداد', action:`App.navigate('${it.page}')`});
    }
  });
  DB.members.forEach(m=>{
    if([m.name,m.code,m.phone].some(v=>String(v||'').toLowerCase().includes(q)))
      results.push({label:m.name, sub:'مخدوم — '+esc(nameOf(DB.classes,m.classId)), action:`App.navigate('memberProfile','${m.id}')`});
  });
  DB.servants.forEach(s=>{
    if([s.name,s.code,s.phone].some(v=>String(v||'').toLowerCase().includes(q)))
      results.push({label:s.name, sub:'خادم', action:`Servants.viewProfile('${s.id}')`});
  });
  (DB.users||[]).forEach(u=>{
    if([u.name,u.email].some(v=>String(v||'').toLowerCase().includes(q)))
      results.push({label:u.name, sub:'مستخدم — '+(ROLE_LABELS[u.role]||u.role), action:`App.navigate('users')`});
  });
  DB.stages.forEach(s=>{ if((s.name||'').toLowerCase().includes(q)) results.push({label:s.name, sub:'مرحلة', action:`App.navigate('stages')`}); });
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

/* مؤشر بسيط لحالة الاتصال — Firestore أصلاً بيخزن محليًا (enableIndexedDbPersistence) ويزامن
   تلقائيًا لما النت يرجع، فده مجرد إشعار بصري للمستخدم مش آلية تخزين جديدة */
function updateOfflineBadge(){
  const badge = document.getElementById('offline-badge');
  if(badge) badge.style.display = navigator.onLine ? 'none' : 'block';
}
window.addEventListener('online', updateOfflineBadge);
window.addEventListener('offline', updateOfflineBadge);
updateOfflineBadge();

/* ---------- Boot ---------- */
document.getElementById('login-pass').addEventListener('keydown', e=>{ if(e.key==='Enter') App.login(); });
document.getElementById('login-user').addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('login-pass').focus(); });
// رابط "تواصل معنا" العام في شاشة الدخول — بيتحمّل حتى قبل تسجيل الدخول
// تسجيل الـ Service Worker (PWA) — بيسمح بتثبيت النظام كتطبيق على شاشة الموبايل
/* لما الـ Service Worker الجديد يستلم الصفحة (بعد نشر تحديث) نعرض شريط "نسخة جديدة" بدل ما المستخدم يفضل على النسخة القديمة من غير ما يعرف.
   مابنعرضوش أول مرة تتثبّت فيها (مفيش نسخة قديمة أصلًا). "لاحقًا" مهمة عشان إعادة التحميل بتمسح أي حضور لسه ماتحفظش. */
function showUpdateBanner(){
  if(document.getElementById('update-banner')) return;
  const b = document.createElement('div');
  b.id = 'update-banner'; b.className = 'no-print';
  b.style.cssText = 'position:fixed; bottom:16px; right:16px; left:16px; max-width:440px; margin:0 auto; z-index:500; background:#33383D; color:#fff; padding:10px 14px; border-radius:12px; display:flex; gap:10px; align-items:center; justify-content:space-between; box-shadow:0 6px 16px rgba(0,0,0,.25); font-size:13px;';
  b.innerHTML = '<span>🔄 فيه نسخة جديدة من التطبيق</span><span style="display:flex; gap:8px;"><button class="btn btn-gold btn-sm" onclick="location.reload()">تحديث الآن</button><button class="btn btn-ghost btn-sm" onclick="document.getElementById(\'update-banner\').remove()">لاحقًا</button></span>';
  document.body.appendChild(b);
}
if('serviceWorker' in navigator){
  const swHadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', ()=>{ if(swHadController) showUpdateBanner(); });
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('service-worker.js').catch(e=>console.error('SW register failed', e)); });
}
let PUBLIC_CONTACTS = {};
let ANNOUNCEMENT_DISMISSED = false;
let MAINTENANCE_CFG = null;
/* بوابة وضع الصيانة — بترجع true لو وقفت المستخدم عند شاشة الصيانة (يبقى لازم توقف باقي كود الدخول) */
function enforceMaintenanceGate(){
  if(!MAINTENANCE_CFG || !MAINTENANCE_CFG.enabled) return false;
  const role = CURRENT_USER && CURRENT_USER.role;
  if(role==='superadmin' || role==='subadmin') return false; // المالك والأدمن الفرعي بيعدّوا عادي
  if(auth.currentUser) signOut(auth).catch(()=>{});
  CURRENT_USER = null; CURRENT_CHURCH_ID = null; CURRENT_CHURCH = null; CHURCH_ACCESS_LOCKED = false;
  hideAllAuthScreens();
  const dEl = document.getElementById('maintenance-return-date');
  if(dEl) dEl.textContent = MAINTENANCE_CFG.expectedReturn ? '📅 موعد الرجوع المتوقع: '+fmtDate(MAINTENANCE_CFG.expectedReturn) : '';
  document.getElementById('maintenance-screen').style.display = 'flex';
  return true;
}
App.showAdminLoginModal = function(){
  UI.openModal('تسجيل دخول الأدمن 🔒', `
    <div class="field"><label>البريد الإلكتروني</label><input id="ml-email" type="email"></div>
    <div class="field"><label>كلمة المرور</label><input id="ml-pass" type="password"></div>
    <p class="login-error" id="ml-error" style="display:block;"></p>
  `, `<button class="btn btn-primary btn-block" onclick="App.maintenanceLogin()">دخول</button>`);
};
App.maintenanceLogin = async function(){
  const email = document.getElementById('ml-email').value.trim();
  const pass = document.getElementById('ml-pass').value;
  const errEl = document.getElementById('ml-error');
  errEl.textContent = '';
  try{
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    const roleDoc = await getDoc(doc(dbFire,'users', cred.user.uid));
    const role = roleDoc.exists() ? roleDoc.data().role : null;
    if(role!=='superadmin' && role!=='subadmin'){
      await signOut(auth);
      errEl.textContent = 'الموقع تحت الصيانة حاليًا — الدخول متاح للإدارة بس.';
      return;
    }
    UI.closeModal();
    // onAuthStateChanged هيتولى فتح لوحة المالك تلقائيًا
  }catch(e){ errEl.textContent = 'بيانات الدخول غير صحيحة'; }
};
getDoc(doc(dbFire,'platformConfig','public')).then(d=>{
  const cfg = d.exists() ? d.data() : {};
  if(cfg.theme) applyTheme(cfg.theme);
  PUBLIC_CONTACTS = cfg.contacts || {};
  MAINTENANCE_CFG = cfg.maintenance || {enabled:false};
  enforceMaintenanceGate();
  const el = document.getElementById('public-contact-link');
  const hasAny = Object.values(PUBLIC_CONTACTS).some(v=>v);
  if(el && hasAny) el.style.display='block';
  PUBLIC_ANNOUNCEMENT = cfg.announcement || null;   // بنسيبها لحد ما حد يسجّل دخول (maybeShowAnnouncement) — مش بتتعرض على الزوار
  maybeShowAnnouncement();
}).catch(()=>{});
/* الإعلان بيتعرض بس لمستخدم مسجّل دخول فعليًا (أي دور)، مش للزوار على شاشة الدخول.
   بتتنادى بعد ما تجهز حاجتين مش بالترتيب بالضرورة: إعدادات الإعلان (فوق) ونجاح تسجيل الدخول. */
function maybeShowAnnouncement(){
  if(!CURRENT_USER || !PUBLIC_ANNOUNCEMENT) return;
  if(PUBLIC_ANNOUNCEMENT.enabled && PUBLIC_ANNOUNCEMENT.text && !ANNOUNCEMENT_DISMISSED){
    document.getElementById('announcement-text').textContent = PUBLIC_ANNOUNCEMENT.text;
    document.getElementById('announcement-text2').textContent = PUBLIC_ANNOUNCEMENT.text;
    document.getElementById('announcement-bar').style.display = 'flex';
  }
}
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
window.UsersV = UsersV; window.SettingsV = SettingsV; window.BackupV = BackupV; window.TrashV = TrashV;
window.WA = WA; window.Onboarding = Onboarding; window.DataQuality = DataQuality; window.Lessons = Lessons; window.Reception = Reception; window.EmailVerify = EmailVerify; window.exportTableToCSV = exportTableToCSV; window.openChurchPhotoLightbox = openChurchPhotoLightbox; window.closeChurchPhotoLightbox = closeChurchPhotoLightbox;
