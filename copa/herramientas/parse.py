import json,re,sys
raw={int(k):v for k,v in json.load(open(sys.argv[1])).items()}
out={}
U="A-ZÁÉÍÓÚÑÜÇÀÈÒÏ'\\-\\. "
for n,t in sorted(raw.items()):
    t=t.replace('\\.','.').replace('\\','')
    t=re.sub(r'_[^_]*_',' ',t)  # remove italic notes
    t=re.sub(r'Splash Meet Manager.*?Clasificación\s+(AN\s+)?RT\s+Tiempo\s+Ptos.\s+AQUA',' ',t,flags=re.S) if False else t
    J=re.sub(r'\s+',' ',t)
    title=re.search(r'Prueba \d+,? (Masc|Fem)\.?,? (.*?),? Abs',J)
    ev=title.group(2)
    rel='4 x' in ev
    # remove page headers
    J=re.sub(r'Splash Meet Manager.*?AQUA',' ',J)
    J=re.sub(r'\d+m: [\d:\.]+ [\d\.]+',' ',J)  # splits
    J=re.sub(r'\s+',' ',J)
    rows=[]
    if not rel:
        for m in re.finditer(r"(?:(\d+)\. )?([%s]+, [^\d*]+?) ?(\d\d) ([^*]+?) (?:[+-]\d,\d\d )?(?:\*\*)?(\d*:?\d+\.\d\d)(?:\*\*)? ([\d,]+) \d+"%U,J):
            rows.append({'p':int(m.group(1)) if m.group(1) else None,'n':m.group(2).strip(),'y':m.group(3),'club':m.group(4).strip(),'t':m.group(5),'pts':float(m.group(6).replace(',','.'))})
        for m in re.finditer(r"(DSQ|DNS|NP|BAJA) ([%s]+, [^\d]+?) ?(\d\d) (.+?) -"%U,J):
            rows.append({'x':m.group(1),'n':m.group(2).strip(),'y':m.group(3),'club':m.group(4).strip()})
    else:
        parts=list(re.finditer(r"([^*]+?) (?:[+-]\d,\d\d )?\*\*([\d:\.]+)\*\* ([\d,]+) \d+",J))
        SW=r"([%s]+, [^\d+\-]+?) ?(?:(\d\d) )?((?:[+-]\d,\d\d )?(?:[\d:]*\d+\.\d\d ?)+)"%U
        def swims(txt):
            res=[];last=0
            for s_ in re.finditer(SW,txt):
                nums=re.findall(r"[\d:]*\d+\.\d\d",s_.group(3))
                res.append([s_.group(1).strip(),s_.group(2),nums[-1]]);last=s_.end()
            return res,last
        prev=None
        for i,m in enumerate(parts):
            txt=m.group(1)
            sw,last=swims(txt)
            if prev is not None: prev['sw']=sw
            head=txt[last:].strip()
            mm=re.search(r"(\d+)\. (.*)$",head)
            p=int(mm.group(1)) if mm else None
            club=(mm.group(2) if mm else head).strip()
            prev={'p':p,'club':club,'t':m.group(2),'pts':float(m.group(3).replace(',','.')),'sw':[]}
            rows.append(prev)
        if prev is not None:
            sw,_=swims(J[parts[-1].end():]); prev['sw']=sw
        for m in re.finditer(r"(DSQ|DNS) (.+?) -",J):
            rows.append({'x':m.group(1),'club':m.group(2)[:60]})
    out[n]={'g':title.group(1),'ev':ev,'rows':rows}
    ok=[r for r in rows if 't' in r]
    print(n,title.group(1),ev,len(ok),sum(r.get('pts',0) for r in rows), [ (r['x'],r.get('n',r.get('club'))) for r in rows if 'x' in r], [len(r['sw']) for r in ok] if rel else '')
json.dump(out,open(sys.argv[2],'w'),ensure_ascii=False)
