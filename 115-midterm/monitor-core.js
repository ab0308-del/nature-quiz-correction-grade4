(function(root){
function buildReport(classes,submissions,selected=''){
 const rows=[];const validClasses=classes.filter(c=>!selected||c.class_name===selected);
 const latest=new Map();for(const s of submissions){const k=s.class_name+'|'+s.seat;const old=latest.get(k);if(!old||s.submitted_at>old.submitted_at)latest.set(k,s);}
 for(const c of validClasses)for(const seat of c.seats){const s=latest.get(c.class_name+'|'+seat);rows.push({class_name:c.class_name,seat,submission:s||null});}
 const submitted=rows.filter(r=>r.submission).map(r=>r.submission);const reds=new Map();
 for(const s of submitted)for(const [id,status] of Object.entries(s.states)){if(status==='no'){if(!reds.has(id))reds.set(id,[]);reds.get(id).push({class_name:s.class_name,seat:s.seat,name:s.student_name});}}
 return {rows,submitted,reds,missing:rows.length-submitted.length};
}
function ratedCount(states){return Object.values(states).filter(s=>['ok','partial','no'].includes(s)).length;}
const api={buildReport,ratedCount};if(typeof module!=='undefined')module.exports=api;else root.CorrectionMonitor=api;
})(typeof window==='undefined'?globalThis:window);
