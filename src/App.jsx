import { useState, useEffect, useRef } from "react";


// ====== Google Sheets API ======
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOVqpR2nBHpb3mzgOGfEJWypoDKzAfTi3biWIBeeQo-e1ghjEAOigyCzbhNcu9wO3kdA/exec";

async function loadShared(key) {
  try {
    const res = await fetch(`${SCRIPT_URL}?key=${encodeURIComponent(key)}`);
    const data = await res.json();
    return data.value ? JSON.parse(data.value) : null;
  } catch { return null; }
}

async function saveShared(key, val) {
  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value: JSON.stringify(val) }),
    });
  } catch {}
}
// ==============================

const MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];
const SCHOOL_MONTHS = [8,9,10,11,0,1,2,3,4,5];
const DAYS_HE = ["א","ב","ג","ד","ה","ו","ש"];
const CURRENT_YEAR = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth();
function getSchoolYear() { return CURRENT_MONTH >= 8 ? CURRENT_YEAR : CURRENT_YEAR - 1; }
function getCalYear(sy, mi) { return mi >= 8 ? sy : sy + 1; }
function schoolYearLabel(sy) { return `${sy}/${sy+1}`; }

const EVENT_TYPES = [
  { key:"absent",   label:"היעדרות",      color:"#e74c3c", bg:"#fdecea" },
  { key:"vacation", label:"חופשה",         color:"#27ae60", bg:"#eafaf1" },
  { key:"mm",       label:'מ"מ',          color:"#2980b9", bg:"#eaf4fb", hasValue:true },
  { key:"bonus",    label:"בונוס",         color:"#8e44ad", bg:"#f5eef8" },
  { key:"late",     label:"איחור",         color:"#e67e22", bg:"#fef5e7" },
  { key:"early",    label:"שחרור מוקדם",  color:"#16a085", bg:"#e8f8f5" },
];
const EVENT_MAP = Object.fromEntries(EVENT_TYPES.map(e=>[e.key,e]));
const defaultEmployee = { id:"", name:"", email:"", role:"", dept:"" };

function genId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function getDaysInMonth(y,m) { return new Date(y,m+1,0).getDate(); }
function getDayOfWeek(y,m,d) { return new Date(y,m,d).getDay(); }
function isWeekend(y,m,d) { return getDayOfWeek(y,m,d)===6; }

const ABSENCE_KEYS  = ["היעדרות","נעדר","היעדר"];
const VACATION_KEYS = ["חופשה","חופש","יום חופש"];
const MM_KEYS       = ['מ"מ',"מילוי מקום","ממלא מקום","מ''מ"];
const BONUS_KEYS    = ["בונוס"];
const LATE_KEYS     = ["איחור"];
const EARLY_KEYS    = ["שחרור מוקדם","שחרור"];
function matchKey(val,keys) { if(!val) return false; const v=val.trim(); return keys.some(k=>v===k||v.includes(k)); }
function extractMM(val) { if(!val) return 0; const v=val.trim(); const n=parseFloat(v); return(!isNaN(n)&&n>0&&/^\d+(\.\d+)?$/.test(v))?n:0; }

export default function App() {
  const [tab, setTab]                     = useState("employees");
  const [employees, setEmployees]         = useState([]);
  const [dailyData, setDailyData]         = useState({});
  const [schoolYear, setSchoolYear]       = useState(getSchoolYear());
  const [selMonthIdx, setSelMonthIdx]     = useState(()=>{ const cur=SCHOOL_MONTHS.indexOf(CURRENT_MONTH); return cur>=0?cur:0; });
  const [empModal, setEmpModal]           = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [importModal, setImportModal]     = useState(false);
  const [csvModal, setCsvModal]           = useState(false);
  const [cellMenu, setCellMenu]           = useState(null);
  const [mmInput, setMmInput]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [saving, setSaving]               = useState(false);
  const [toast, setToast]                 = useState("");
  const menuRef = useRef();

  const showToast = msg => { setToast(msg); setTimeout(()=>setToast(""),3000); };
  const selMonth = SCHOOL_MONTHS[selMonthIdx];
  const selYear  = getCalYear(schoolYear, selMonth);

  useEffect(()=>{
    (async()=>{
      const emps=await loadShared("hr:employees");
      const data=await loadShared("hr:daily");
      if(emps) setEmployees(emps);
      if(data) setDailyData(data);
      setLoading(false);
    })();
  },[]);

  useEffect(()=>{
    const handler=e=>{ if(menuRef.current&&!menuRef.current.contains(e.target)){ setCellMenu(null); setMmInput(null); } };
    document.addEventListener("mousedown",handler);
    return ()=>document.removeEventListener("mousedown",handler);
  },[]);

  const saveDailyData = async data => { setDailyData(data); setSaving(true); await saveShared("hr:daily",data); setSaving(false); };
  const saveEmployees = async emps => { setEmployees(emps); setSaving(true); await saveShared("hr:employees",emps); setSaving(false); };

  const dayKey = (y,m,d) => `${y}-${m}-${d}`;
  const getCellData = (empId,day) => dailyData[dayKey(selYear,selMonth,day)]?.[empId]||null;

  const setCellData = async (empId,day,data) => {
    const k=dayKey(selYear,selMonth,day);
    await saveDailyData({...dailyData,[k]:{...dailyData[k],[empId]:data}});
  };

  const clearCell = async (empId,day) => {
    const k=dayKey(selYear,selMonth,day);
    const updated={...dailyData};
    if(updated[k]){ delete updated[k][empId]; if(!Object.keys(updated[k]).length) delete updated[k]; }
    await saveDailyData(updated);
  };

  const toggleApproval = async (empId,day,e) => {
    e.stopPropagation();
    const k=dayKey(selYear,selMonth,day);
    const cell=dailyData[k]?.[empId];
    if(!cell||cell.type!=="absent") return;
    await saveDailyData({...dailyData,[k]:{...dailyData[k],[empId]:{...cell,approved:!cell.approved}}});
  };

  const handleCellClick = (empId,day,e) => {
    if(isWeekend(selYear,selMonth,day)) return;
    const rect=e.currentTarget.getBoundingClientRect();
    setCellMenu({empId,day,x:rect.left,y:rect.bottom+window.scrollY});
    setMmInput(null);
  };

  const handleSelectEvent = async type => {
    if(!cellMenu) return;
    const {empId,day}=cellMenu;
    if(type==="mm"){ setMmInput({empId,day,x:cellMenu.x,y:cellMenu.y}); setCellMenu(null); return; }
    if(type===null) await clearCell(empId,day);
    else await setCellData(empId,day,{type});
    setCellMenu(null);
  };

  const handleMmSubmit = async val => {
    if(!mmInput) return;
    const n=parseFloat(val);
    if(!isNaN(n)&&n>0) await setCellData(mmInput.empId,mmInput.day,{type:"mm",value:n});
    setMmInput(null);
  };

  const getMonthlySummary = (empId,year,month) => {
    const days=getDaysInMonth(year,month);
    const t={absent:0,vacation:0,mm:0,bonus:0,late:0,early:0,approvedAbsent:0};
    for(let d=1;d<=days;d++){
      const cell=dailyData[dayKey(year,month,d)]?.[empId];
      if(!cell) continue;
      if(cell.type==="mm") t.mm+=(cell.value||1);
      else if(t[cell.type]!==undefined) t[cell.type]++;
      if(cell.type==="absent"&&cell.approved) t.approvedAbsent++;
    }
    return t;
  };

  const importCSV = async (csvText,month,year) => {
    const lines=csvText.trim().split("\n");
    if(lines.length<2){ showToast("הקובץ ריק"); return; }
    const skipCols=new Set(["תאריך","יום בשבוע","הערות",""]);
    const headers=lines[0].split(",").map(h=>h.replace(/^"|"$/g,"").trim());
    const empCols=headers.map((h,i)=>({name:h,i})).filter(c=>!skipCols.has(c.name));
    const updated={...dailyData};
    for(let r=1;r<lines.length;r++){
      const cells=lines[r].split(",").map(c=>c.replace(/^"|"$/g,"").trim());
      const firstCell=cells[0]||"";
      const isDateRow=/\d{1,2}[.\/\-]\d{1,2}/.test(firstCell)||/^\d{1,2}$/.test(firstCell);
      if(!isDateRow) continue;
      const dayNum=parseInt(firstCell.match(/\d+/)?.[0])||0;
      if(!dayNum) continue;
      const k=dayKey(year,month,dayNum);
      empCols.forEach(({name,i})=>{
        const v=cells[i]||""; if(!v) return;
        const emp=employees.find(e=>e.name===name||e.name.trim()===name.trim());
        if(!emp) return;
        let cellData=null;
        if     (matchKey(v,ABSENCE_KEYS))  cellData={type:"absent"};
        else if(matchKey(v,VACATION_KEYS)) cellData={type:"vacation"};
        else if(matchKey(v,MM_KEYS))       cellData={type:"mm",value:1};
        else if(matchKey(v,BONUS_KEYS))    cellData={type:"bonus"};
        else if(matchKey(v,LATE_KEYS))     cellData={type:"late"};
        else if(matchKey(v,EARLY_KEYS))    cellData={type:"early"};
        else { const h=extractMM(v); if(h>0) cellData={type:"mm",value:h}; }
        if(cellData) updated[k]={...updated[k],[emp.id]:cellData};
      });
    }
    await saveDailyData(updated);
    setCsvModal(false);
    showToast(`✓ יובאו נתונים לחודש ${MONTHS_HE[month]} ${year}`);
  };

  const saveEmployee = async emp => {
    const updated=emp.id?employees.map(e=>e.id===emp.id?emp:e):[...employees,{...emp,id:genId()}];
    await saveEmployees(updated); setEmpModal(null);
    showToast(emp.id?"העובד עודכן ✓":"העובד נוסף ✓");
  };

  const deleteEmployee = async id => {
    await saveEmployees(employees.filter(e=>e.id!==id));
    setDeleteConfirm(null); showToast("העובד נמחק");
  };

  const importEmployees = async text => {
    const lines=text.trim().split("\n").filter(l=>l.trim());
    const startIdx=lines[0]&&(lines[0].includes("שם")||lines[0].toLowerCase().includes("name"))?1:0;
    const newEmps=[];
    for(let i=startIdx;i<lines.length;i++){
      const parts=lines[i].split(/\t|,|;/).map(p=>p.trim()).filter(Boolean);
      if(!parts[0]) continue;
      const name=parts[0],email=parts[1]||"";
      if(employees.some(e=>e.name===name)) continue;
      newEmps.push({id:genId(),name,email,role:"",dept:""});
    }
    if(!newEmps.length){ showToast("לא נמצאו עובדים חדשים"); return; }
    await saveEmployees([...employees,...newEmps]);
    setImportModal(false); showToast(`✓ יובאו ${newEmps.length} עובדים`);
  };

  const exportCSV = () => {
    const rows=[["שם","מחלקה","חודש","היעדרויות","חופשות",'שעות מ"מ',"בונוסים","איחורים","שחרורים מוקדמים"]];
    employees.forEach(emp=>{
      SCHOOL_MONTHS.forEach(mi=>{
        const cy=getCalYear(schoolYear,mi);
        const t=getMonthlySummary(emp.id,cy,mi);
        if(Object.values(t).some(v=>v>0))
          rows.push([emp.name,emp.dept||"",MONTHS_HE[mi],t.absent,t.vacation,t.mm,t.bonus,t.late,t.early]);
      });
    });
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,\uFEFF"+encodeURIComponent(csv);
    a.download=`סיכום_${schoolYearLabel(schoolYear)}.csv`; a.click();
  };

  const daysInMonth=getDaysInMonth(selYear,selMonth);
  const dayNumbers=Array.from({length:daysInMonth},(_,i)=>i+1);
  const schoolYearOptions=[-1,0,1].map(d=>schoolYear+d);

  if(loading) return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",fontFamily:"'Segoe UI',Arial,sans-serif",direction:"rtl",gap:16}}>
      <div style={{fontSize:40}}>👥</div>
      <div style={{fontSize:18,color:"#555"}}>טוען נתונים מ-Google Sheets...</div>
    </div>
  );

  const s=styles;
  return (
    <div style={s.root}>
      {toast && <div style={s.toast}>{toast}</div>}
      {saving && <div style={s.savingDot} title="שומר ב-Google Sheets...">☁️</div>}

      <div style={s.header}>
        <span style={s.headerTitle}>👥 מערכת ניהול עובדים</span>
        <span style={s.headerYear}>שנה"ל {schoolYearLabel(schoolYear)}</span>
      </div>

      <div style={s.tabs}>
        {[["employees","👤 עובדים"],["monthly","📅 קלט חודשי"],["summary","📊 סיכום שנתי"]].map(([k,l])=>(
          <button key={k} style={{...s.tab,...(tab===k?s.tabActive:{})}} onClick={()=>setTab(k)}>{l}</button>
        ))}
      </div>

      <div style={s.content}>
        {tab==="employees" && (
          <div>
            <div style={s.toolbar}>
              <span style={s.tabTitle}>רשימת עובדים ({employees.length})</span>
              <div style={{display:"flex",gap:8}}>
                <button style={s.btnSecondary} onClick={()=>setImportModal(true)}>📋 ייבוא מרשימה</button>
                <button style={s.btnPrimary} onClick={()=>setEmpModal({...defaultEmployee})}>+ הוסף עובד</button>
              </div>
            </div>
            {employees.length===0 ? <div style={s.empty}>עדיין אין עובדים.</div> : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead><tr>{["שם","מייל","תפקיד","מחלקה",""].map((h,i)=><th key={i} style={s.th}>{h}</th>)}</tr></thead>
                  <tbody>{employees.map((emp,i)=>(
                    <tr key={emp.id} style={{background:i%2===0?"#fff":"#f9fafb"}}>
                      <td style={s.td}>{emp.name}</td>
                      <td style={{...s.td,fontSize:13,color:"#666"}}>{emp.email||"—"}</td>
                      <td style={s.td}>{emp.role||"—"}</td>
                      <td style={s.td}>{emp.dept||"—"}</td>
                      <td style={s.td}>
                        <button style={s.btnSmall} onClick={()=>setEmpModal(emp)}>✏️</button>
                        <button style={{...s.btnSmall,...s.btnDanger}} onClick={()=>setDeleteConfirm(emp.id)}>🗑️</button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab==="monthly" && (
          <div>
            <div style={s.toolbar}>
              <span style={s.tabTitle}>קלט חודשי</span>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <select style={s.select} value={schoolYear} onChange={e=>setSchoolYear(+e.target.value)}>
                  {schoolYearOptions.map(y=><option key={y} value={y}>שנה"ל {schoolYearLabel(y)}</option>)}
                </select>
                <select style={s.select} value={selMonthIdx} onChange={e=>setSelMonthIdx(+e.target.value)}>
                  {SCHOOL_MONTHS.map((m,i)=><option key={i} value={i}>{MONTHS_HE[m]}</option>)}
                </select>
                <button style={s.btnSecondary} onClick={()=>setCsvModal(true)}>📂 ייבוא מ-CSV</button>
              </div>
            </div>
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              {EVENT_TYPES.map(et=>(
                <div key={et.key} style={{display:"flex",alignItems:"center",gap:4,fontSize:12}}>
                  <div style={{width:14,height:14,borderRadius:3,background:et.bg,border:`2px solid ${et.color}`}}></div>
                  <span style={{color:"#555"}}>{et.label}</span>
                </div>
              ))}
            </div>
            {employees.length===0 ? <div style={s.empty}>הוסיפי עובדים תחילה.</div> : (
              <div style={s.tableWrap}>
                <table style={{...s.table,tableLayout:"fixed"}}>
                  <thead>
                    <tr>
                      <th style={{...s.th,minWidth:130,width:130,position:"sticky",right:0,zIndex:2,background:"#e8f0fe"}}>עובד</th>
                      {dayNumbers.map(d=>{
                        const dow=getDayOfWeek(selYear,selMonth,d);
                        const we=dow===6;
                        return (
                          <th key={d} style={{...s.th,width:36,minWidth:36,padding:"4px 2px",textAlign:"center",background:we?"#f0f0f0":"#e8f0fe",color:we?"#aaa":"#1e3a5f",fontSize:11}}>
                            <div>{d}</div>
                            <div style={{fontWeight:400,fontSize:10}}>{DAYS_HE[dow]}</div>
                          </th>
                        );
                      })}
                      <th style={{...s.th,minWidth:70,fontSize:11}}>סה"כ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp,ei)=>{
                      const tot=getMonthlySummary(emp.id,selYear,selMonth);
                      return (
                        <tr key={emp.id} style={{background:ei%2===0?"#fff":"#f9fafb"}}>
                          <td style={{...s.td,fontWeight:500,fontSize:13,position:"sticky",right:0,background:ei%2===0?"#fff":"#f9fafb",zIndex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:130}}>{emp.name}</td>
                          {dayNumbers.map(d=>{
                            const we=isWeekend(selYear,selMonth,d);
                            const cell=getCellData(emp.id,d);
                            const et=cell?EVENT_MAP[cell.type]:null;
                            return (
                              <td key={d} onClick={e=>handleCellClick(emp.id,d,e)}
                                style={{...s.td,padding:"2px",textAlign:"center",cursor:we?"default":"pointer",
                                  background:we?"#f8f8f8":et?et.bg:"transparent",
                                  border:cell?.type==="absent"?`2px solid ${cell.approved?"#27ae60":"#e74c3c"}`:et?`1px solid ${et.color}`:"1px solid #eef2f7",
                                  position:"relative",minWidth:36,width:36}}>
                                {et&&<div style={{fontSize:10,color:et.color,fontWeight:700,lineHeight:1.2}}>{cell.type==="mm"?cell.value||'מ"מ':et.label.slice(0,2)}</div>}
                                {cell?.type==="absent"&&(
                                  <div onClick={e=>toggleApproval(emp.id,d,e)}
                                    title={cell.approved?"אישור התקבל":"ממתין לאישור"}
                                    style={{position:"absolute",top:1,left:1,fontSize:11,lineHeight:1,cursor:"pointer"}}>
                                    {cell.approved?"✅":"📎"}
                                  </div>
                                )}
                                {we&&<div style={{fontSize:10,color:"#ddd"}}>—</div>}
                              </td>
                            );
                          })}
                          <td style={{...s.td,fontSize:11,textAlign:"center",background:"#f5f5f5"}}>
                            {tot.absent>0&&<div style={{color:tot.approvedAbsent<tot.absent?"#e74c3c":"#27ae60",fontWeight:600}}>ה:{tot.absent} ✅{tot.approvedAbsent}/{tot.absent}</div>}
                            {tot.vacation>0&&<div style={{color:"#27ae60"}}>ח:{tot.vacation}</div>}
                            {tot.mm>0&&<div style={{color:"#2980b9"}}>מ:{tot.mm}</div>}
                            {tot.bonus>0&&<div style={{color:"#8e44ad"}}>ב:{tot.bonus}</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab==="summary" && (
          <div>
            <div style={s.toolbar}>
              <span style={s.tabTitle}>סיכום שנתי</span>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <select style={s.select} value={schoolYear} onChange={e=>setSchoolYear(+e.target.value)}>
                  {schoolYearOptions.map(y=><option key={y} value={y}>שנה"ל {schoolYearLabel(y)}</option>)}
                </select>
                <button style={s.btnSecondary} onClick={exportCSV}>📥 ייצוא CSV</button>
              </div>
            </div>
            {employees.length===0 ? <div style={s.empty}>אין עובדים.</div> : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={{...s.th,minWidth:130,position:"sticky",right:0,zIndex:2}}>עובד</th>
                      {SCHOOL_MONTHS.map(mi=><th key={mi} style={{...s.th,fontSize:11,padding:"6px 4px",minWidth:70}}>{MONTHS_HE[mi]}</th>)}
                      <th style={{...s.th,background:"#1e3a5f",color:"#fff",fontSize:11}}>היעד׳</th>
                      <th style={{...s.th,background:"#1e3a5f",color:"#fff",fontSize:11}}>חופש</th>
                      <th style={{...s.th,background:"#1e3a5f",color:"#fff",fontSize:11}}>מ"מ</th>
                      <th style={{...s.th,background:"#1e3a5f",color:"#fff",fontSize:11}}>בונוס</th>
                      <th style={{...s.th,background:"#1e3a5f",color:"#fff",fontSize:11}}>איחורים</th>
                      <th style={{...s.th,background:"#1e3a5f",color:"#fff",fontSize:11}}>ש.מוקדם</th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp,ei)=>{
                      const yearTot={absent:0,vacation:0,mm:0,bonus:0,late:0,early:0};
                      return (
                        <tr key={emp.id} style={{background:ei%2===0?"#fff":"#f9fafb"}}>
                          <td style={{...s.td,fontWeight:500,position:"sticky",right:0,background:ei%2===0?"#fff":"#f9fafb",zIndex:1}}>{emp.name}</td>
                          {SCHOOL_MONTHS.map(mi=>{
                            const cy=getCalYear(schoolYear,mi);
                            const t=getMonthlySummary(emp.id,cy,mi);
                            Object.keys(yearTot).forEach(k=>yearTot[k]+=t[k]);
                            const has=Object.values(t).some(v=>v>0);
                            return (
                              <td key={mi} style={{...s.td,fontSize:11,padding:"4px",textAlign:"center"}}>
                                {has?(
                                  <div style={{lineHeight:1.4}}>
                                    {t.absent>0&&<div style={{color:"#e74c3c"}}>ה:{t.absent}</div>}
                                    {t.vacation>0&&<div style={{color:"#27ae60"}}>ח:{t.vacation}</div>}
                                    {t.mm>0&&<div style={{color:"#2980b9"}}>מ:{t.mm}</div>}
                                    {t.bonus>0&&<div style={{color:"#8e44ad"}}>ב:{t.bonus}</div>}
                                    {t.late>0&&<div style={{color:"#e67e22"}}>א:{t.late}</div>}
                                    {t.early>0&&<div style={{color:"#16a085"}}>ש:{t.early}</div>}
                                  </div>
                                ):<span style={{color:"#ddd"}}>—</span>}
                              </td>
                            );
                          })}
                          <td style={{...s.td,fontWeight:700,color:"#e74c3c",textAlign:"center",background:"#fef9f9"}}>{yearTot.absent}</td>
                          <td style={{...s.td,fontWeight:700,color:"#27ae60",textAlign:"center",background:"#f0faf4"}}>{yearTot.vacation}</td>
                          <td style={{...s.td,fontWeight:700,color:"#2980b9",textAlign:"center",background:"#f0f7fd"}}>{yearTot.mm}</td>
                          <td style={{...s.td,fontWeight:700,color:"#8e44ad",textAlign:"center",background:"#f8f0fd"}}>{yearTot.bonus}</td>
                          <td style={{...s.td,fontWeight:700,color:"#e67e22",textAlign:"center",background:"#fef5e7"}}>{yearTot.late}</td>
                          <td style={{...s.td,fontWeight:700,color:"#16a085",textAlign:"center",background:"#e8f8f5"}}>{yearTot.early}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {cellMenu && (
        <div ref={menuRef} style={{...s.floatMenu,top:Math.min(cellMenu.y,window.innerHeight-300),left:Math.max(10,Math.min(cellMenu.x,window.innerWidth-180))}}>
          <div style={s.floatMenuTitle}>סמני אירוע</div>
          {EVENT_TYPES.map(et=>(
            <button key={et.key} style={{...s.floatMenuItem,color:et.color,background:et.bg}} onClick={()=>handleSelectEvent(et.key)}>{et.label}</button>
          ))}
          <button style={{...s.floatMenuItem,color:"#999",background:"#f5f5f5"}} onClick={()=>handleSelectEvent(null)}>🗑️ נקה</button>
        </div>
      )}

      {mmInput && (
        <div ref={menuRef} style={{...s.floatMenu,top:Math.min(mmInput.y,window.innerHeight-150),left:Math.max(10,Math.min(mmInput.x,window.innerWidth-200)),width:180}}>
          <div style={s.floatMenuTitle}>שעות מ"מ</div>
          <input type="number" min="0.5" step="0.5" autoFocus
            style={{width:"100%",padding:"8px",border:"1px solid #d0dff0",borderRadius:6,fontSize:14,boxSizing:"border-box",marginBottom:8,direction:"ltr"}}
            placeholder="מספר שעות"
            onKeyDown={e=>{ if(e.key==="Enter") handleMmSubmit(e.target.value); if(e.key==="Escape") setMmInput(null); }} />
          <div style={{display:"flex",gap:6}}>
            <button style={{...s.btnSecondary,flex:1,padding:"6px"}} onClick={()=>setMmInput(null)}>ביטול</button>
            <button style={{...s.btnPrimary,flex:1,padding:"6px"}}
              onClick={e=>handleMmSubmit(e.currentTarget.closest("div").previousSibling.value)}>אשר</button>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div style={s.modalOverlay} onClick={()=>setDeleteConfirm(null)}>
          <div style={{...s.modal,width:320,textAlign:"center"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontSize:36,marginBottom:12}}>🗑️</div>
            <div style={{fontSize:17,fontWeight:700,marginBottom:8,color:"#1e3a5f"}}>מחיקת עובד</div>
            <div style={{fontSize:14,color:"#666",marginBottom:24}}>
              האם למחוק את <strong>{employees.find(e=>e.id===deleteConfirm)?.name}</strong>?
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"center"}}>
              <button style={s.btnSecondary} onClick={()=>setDeleteConfirm(null)}>ביטול</button>
              <button style={{...s.btnPrimary,background:"#c0392b"}} onClick={()=>deleteEmployee(deleteConfirm)}>כן, מחק</button>
            </div>
          </div>
        </div>
      )}

      {importModal && <ImportModal onImport={importEmployees} onCancel={()=>setImportModal(false)} />}
      {csvModal && <CsvModal month={selMonth} year={selYear} onImport={importCSV} onCancel={()=>setCsvModal(false)} />}
      {empModal && (
        <div style={s.modalOverlay} onClick={()=>setEmpModal(null)}>
          <div style={s.modal} onClick={e=>e.stopPropagation()}>
            <div style={s.modalTitle}>{empModal.id?"עריכת עובד":"הוספת עובד"}</div>
            <EmpForm emp={empModal} onSave={saveEmployee} onCancel={()=>setEmpModal(null)} />
          </div>
        </div>
      )}
    </div>
  );
}

function CsvModal({ month, year, onImport, onCancel }) {
  const [file,setFile]=useState(null);
  const [selMonth,setSelMonth]=useState(month);
  const [selYear,setSelYear]=useState(year);
  const [preview,setPreview]=useState("");
  const [loading,setLoading]=useState(false);
  const s=styles;
  const handleFile=e=>{ const f=e.target.files[0]; if(!f) return; setFile(f); const r=new FileReader(); r.onload=ev=>setPreview(ev.target.result.split("\n").slice(0,3).join("\n")); r.readAsText(f,"UTF-8"); };
  const doImport=async()=>{ if(!file) return; setLoading(true); const r=new FileReader(); r.onload=async ev=>{ await onImport(ev.target.result,selMonth,selYear); setLoading(false); }; r.readAsText(file,"UTF-8"); };
  return (
    <div style={s.modalOverlay} onClick={onCancel}>
      <div style={{...s.modal,width:500}} onClick={e=>e.stopPropagation()}>
        <div style={s.modalTitle}>📂 ייבוא נתונים מ-CSV</div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <div style={{flex:1}}><label style={s.label}>חודש</label>
            <select style={{...s.select,width:"100%"}} value={selMonth} onChange={e=>setSelMonth(+e.target.value)}>
              {[8,9,10,11,0,1,2,3,4,5].map(m=><option key={m} value={m}>{MONTHS_HE[m]}</option>)}
            </select></div>
          <div style={{flex:1}}><label style={s.label}>שנה</label>
            <select style={{...s.select,width:"100%"}} value={selYear} onChange={e=>setSelYear(+e.target.value)}>
              {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
            </select></div>
        </div>
        <label style={s.label}>קובץ CSV</label>
        <input type="file" accept=".csv" onChange={handleFile} style={{marginBottom:12,fontSize:13}} />
        {preview&&<div style={{background:"#f5f7fa",borderRadius:8,padding:"8px 12px",marginBottom:12,fontSize:11,color:"#666",fontFamily:"monospace",direction:"ltr",whiteSpace:"pre",overflow:"hidden"}}>{preview}</div>}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button style={s.btnSecondary} onClick={onCancel}>ביטול</button>
          <button style={s.btnPrimary} onClick={doImport} disabled={!file||loading}>{loading?"מייבא...":"ייבא נתונים"}</button>
        </div>
      </div>
    </div>
  );
}

function ImportModal({ onImport, onCancel }) {
  const [text,setText]=useState("");
  const [mode,setMode]=useState("file");
  const s=styles;
  const handleFile=e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>setText(ev.target.result); r.readAsText(f,"UTF-8"); };
  return (
    <div style={s.modalOverlay} onClick={onCancel}>
      <div style={{...s.modal,width:500}} onClick={e=>e.stopPropagation()}>
        <div style={s.modalTitle}>📋 ייבוא עובדים מרשימה</div>
        <div style={{display:"flex",marginBottom:16,borderRadius:8,overflow:"hidden",border:"1px solid #d0dff0"}}>
          {[["file","📁 העלאת קובץ"],["text","✏️ הדבקת טקסט"]].map(([k,l])=>(
            <button key={k} onClick={()=>setMode(k)} style={{flex:1,padding:"9px",border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:mode===k?"#2980b9":"#fff",color:mode===k?"#fff":"#555"}}>{l}</button>
          ))}
        </div>
        {mode==="file"?(
          <label style={{display:"flex",flexDirection:"column",alignItems:"center",border:"2px dashed #b0c8e0",borderRadius:10,padding:"24px",cursor:"pointer",background:"#f5f9fd",color:"#2980b9",fontSize:14,fontWeight:600,gap:8}}>
            <span style={{fontSize:32}}>📂</span>
            {text?<span style={{color:"#27ae60"}}>✓ הקובץ נטען</span>:"לחצי להעלאת קובץ"}
            <input type="file" accept=".csv,.txt" onChange={handleFile} style={{display:"none"}} />
          </label>
        ):(
          <textarea style={{width:"100%",height:140,padding:10,border:"1px solid #d0dff0",borderRadius:8,fontSize:13,boxSizing:"border-box",direction:"rtl"}}
            placeholder="שם, מייל (כל שורה = עובד)" value={text} onChange={e=>setText(e.target.value)} autoFocus />
        )}
        <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:16}}>
          <button style={s.btnSecondary} onClick={onCancel}>ביטול</button>
          <button style={s.btnPrimary} onClick={()=>onImport(text)} disabled={!text.trim()}>ייבא עובדים</button>
        </div>
      </div>
    </div>
  );
}

function EmpForm({ emp, onSave, onCancel }) {
  const [form,setForm]=useState(emp);
  const s=styles;
  return (
    <div>
      {[["name","שם מלא *"],["email","מייל"],["role","תפקיד"],["dept","מחלקה"]].map(([k,l])=>(
        <div key={k} style={{marginBottom:14}}>
          <label style={s.label}>{l}</label>
          <input style={s.input} value={form[k]||""} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} />
        </div>
      ))}
      <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:20}}>
        <button style={s.btnSecondary} onClick={onCancel}>ביטול</button>
        <button style={s.btnPrimary} onClick={()=>{if(!form.name?.trim())return alert("נא להזין שם");onSave(form);}}>שמור</button>
      </div>
    </div>
  );
}

const styles = {
  root:{fontFamily:"'Segoe UI',Arial,sans-serif",direction:"rtl",minHeight:"100vh",background:"#f0f4f8"},
  header:{background:"linear-gradient(135deg,#1e3a5f,#2980b9)",color:"#fff",padding:"16px 24px",display:"flex",justifyContent:"space-between",alignItems:"center"},
  headerTitle:{fontSize:20,fontWeight:700},
  headerYear:{fontSize:16,opacity:.8},
  tabs:{display:"flex",background:"#fff",borderBottom:"2px solid #e0e7ef",padding:"0 16px"},
  tab:{padding:"12px 20px",border:"none",background:"none",cursor:"pointer",fontSize:15,color:"#555",borderBottom:"3px solid transparent",marginBottom:"-2px"},
  tabActive:{color:"#2980b9",borderBottomColor:"#2980b9",fontWeight:700},
  content:{padding:"20px 16px",maxWidth:"100%"},
  toolbar:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:10},
  tabTitle:{fontSize:18,fontWeight:700,color:"#1e3a5f"},
  tableWrap:{overflowX:"auto",borderRadius:10,boxShadow:"0 2px 12px rgba(0,0,0,.08)"},
  table:{width:"100%",borderCollapse:"collapse",background:"#fff",fontSize:14},
  th:{background:"#e8f0fe",padding:"10px 12px",textAlign:"right",fontWeight:700,color:"#1e3a5f",borderBottom:"2px solid #d0dff0",whiteSpace:"nowrap"},
  td:{padding:"8px 12px",borderBottom:"1px solid #eef2f7",verticalAlign:"middle"},
  btnPrimary:{background:"#2980b9",color:"#fff",border:"none",borderRadius:8,padding:"9px 18px",cursor:"pointer",fontSize:14,fontWeight:600},
  btnSecondary:{background:"#fff",color:"#2980b9",border:"2px solid #2980b9",borderRadius:8,padding:"8px 16px",cursor:"pointer",fontSize:14,fontWeight:600},
  btnSmall:{background:"#f0f4f8",border:"1px solid #d0dff0",borderRadius:6,padding:"4px 10px",cursor:"pointer",fontSize:12,marginLeft:4},
  btnDanger:{background:"#fde8e8",color:"#c0392b",borderColor:"#f5c6c6"},
  select:{padding:"7px 12px",border:"1px solid #d0dff0",borderRadius:8,fontSize:14,cursor:"pointer"},
  empty:{textAlign:"center",color:"#999",padding:"60px 20px",fontSize:16},
  label:{display:"block",marginBottom:5,fontWeight:600,fontSize:14,color:"#444"},
  input:{width:"100%",padding:"9px 12px",border:"1px solid #d0dff0",borderRadius:8,fontSize:14,boxSizing:"border-box"},
  modalOverlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000},
  modal:{background:"#fff",borderRadius:14,padding:"28px 28px 22px",width:360,maxWidth:"90vw",boxShadow:"0 8px 40px rgba(0,0,0,.2)"},
  modalTitle:{fontSize:20,fontWeight:700,marginBottom:20,color:"#1e3a5f"},
  floatMenu:{position:"fixed",background:"#fff",borderRadius:12,boxShadow:"0 8px 32px rgba(0,0,0,.18)",padding:"8px",zIndex:2000,minWidth:160},
  floatMenuTitle:{fontSize:12,color:"#999",padding:"4px 8px",marginBottom:4},
  floatMenuItem:{display:"block",width:"100%",padding:"8px 12px",border:"none",borderRadius:8,cursor:"pointer",fontSize:13,fontWeight:600,marginBottom:3,textAlign:"right"},
  toast:{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:"#27ae60",color:"#fff",padding:"10px 24px",borderRadius:24,fontSize:15,zIndex:3000,boxShadow:"0 4px 16px rgba(0,0,0,.2)"},
  savingDot:{position:"fixed",top:12,left:16,fontSize:18,zIndex:999},
};
