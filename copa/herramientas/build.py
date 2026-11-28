import json,re
CLUBS=[ # id, match key (normalized), name, short, abbr, color1, color2, city
('terrassa','terrassa','CN Terrassa','Terrassa','CNT','#c8102e','#ffffff','Terrassa'),
('sabadell','sabadell','CN Sabadell','Sabadell','CNS','#0057a8','#ffffff','Sabadell'),
('santandreu','sant andreu','CN Sant Andreu','Sant Andreu','CNSA','#d6001c','#ffd100','Barcelona'),
('canoe','canoe','Real Canoe NC','Real Canoe','RC','#002f6c','#e4002b','Madrid'),
('nados','nados','CD Nados Castellón','Nados Castellón','NAD','#00a3e0','#003b71','Castellón'),
('gsd','gredos','CD Gredos San Diego','Gredos San Diego','GSD','#e35205','#1d1d1b','Madrid'),
('bidasoa','bidasoa','CDN Bidasoa XXI','Bidasoa XXI','BID','#00843d','#ffffff','Irun'),
('olivar','olivar','EM El Olivar','El Olivar','EMO','#5b2c83','#ffd100','Zaragoza'),
('barcelona','barcelona','CN Barcelona','CN Barcelona','CNB','#004d98','#a50044','Barcelona'),
('ferca','ferca','CN Ferca-San José','Ferca-San José','FSJ','#e30613','#000000','Valencia'),
('palma','palma','CN Palma de Mallorca','Palma','CNP','#ffcc00','#c8102e','Palma'),
('sek','sek','CD SEK','SEK','SEK','#003a70','#8dc8e8','Madrid'),
('inacua','inacua','CDN Inacua Málaga','Inacua Málaga','INA','#0091d2','#7ac143','Málaga'),
('mediterrani','mediterrani','CE Mediterrani','Mediterrani','CEM','#0072bc','#ffffff','Barcelona'),
('delfin','delfin','CN Delfín','Delfín','DEL','#009fe3','#002d5a','Ceuta'),
('laspalmas','las palmas','CN Las Palmas','Las Palmas','CNLP','#ffd400','#0067b1','Las Palmas'),
('leganes','leganes','CN Leganés','Leganés','LEG','#1b4f9c','#ffffff','Leganés'),
('moscardo','moscardo','CN Madrid Moscardó','Moscardó','MOS','#e2001a','#1d1d1b','Madrid'),
('mataro','mataro','CN Mataró','Mataró','CNM','#00539f','#ffcc00','Mataró'),
('santfeliu','sant feliu','CN Sant Feliu','Sant Feliu','CNSF','#e30613','#ffffff','Sant Feliu'),
('santaolaya','santa olaya','CN Santa Olaya','Santa Olaya','CNSO','#004a97','#ffffff','Gijón'),
('elche','elche','CN Tenis Elche','Tenis Elche','TE','#007a33','#ffffff','Elche'),
('mairena','mairena','CN Mairena Aljarafe','Mairena','CNMA','#00a650','#ffffff','Mairena del Aljarafe'),
('navial','navial','Navial','Navial','NAV','#0a3d62','#38ada9','Avilés'),
('elvalle','el valle','CD El Valle','El Valle','CDEV','#00843d','#ffd100','Las Palmas'),
('galaico','galaico','CN Galaico','Galaico','GAL','#0071bc','#ffffff','Pontevedra'),
('costaazahar','costa azahar','CN Costa Azahar','Costa Azahar','CA','#f39200','#0072bc','Castellón'),
('granollers','granollers','CN Granollers','Granollers','CNG','#c8102e','#000000','Granollers'),
('tolosaldea','tolosaldea','Tolosaldea Usabal','Tolosaldea','TOL','#e30613','#ffffff','Tolosa'),
]
import unicodedata
def norm(s): return unicodedata.normalize('NFD',s.lower()).encode('ascii','ignore').decode()
def club_id(s):
    n=norm(s)
    for c in CLUBS:
        if c[1] in n: return c[0]
    raise Exception('club?'+s)
def secs(t):
    p=t.split(':'); return round(float(p[-1])+(60*int(p[0]) if len(p)>1 else 0),2)
SMALL={'de','del','la','las','los','y','da','van','le'}
def tc(w):
    return '-'.join(x.capitalize() for x in w.split('-'))
def pretty(n):
    sur,first=[x.strip() for x in n.split(',',1)]
    sur=' '.join(w.lower() if w.lower() in SMALL else tc(w.lower()) for w in sur.split())
    return f"{first} {sur}"
STROKE={'Libre':'L','Espalda':'E','Braza':'B','Mariposa':'M','Estilos':'X'}
def evkey(ev):
    m=re.match(r'(4 x )?(\d+)m (\w+)',ev)
    return ('R' if m.group(1) else '')+m.group(2)+STROKE[m.group(3)]
sw={}   # key -> swimmer
def getsw(name,yob,g,club):
    k=(norm(name),g)
    if k not in sw:
        sw[k]={'id':len(sw)+1,'n':pretty(name),'y':(lambda v:(2000+v if v<=20 else 1900+v))(int(yob)) if yob else None,'g':g,'c':club,'t':{},'e':{}}
    s=sw[k]
    if yob and not s['y']: s['y']=(lambda v:(2000+v if v<=20 else 1900+v))(int(yob))
    return s
res={}
FLY={'50':0.55,'100':0.65,'200':0.75}
legst={'RX':['E','B','M','L']}
for div,f in [('dh','parsed.json'),('p1','parsed1.json')]:
    d=json.load(open(f))
    res[div]={}
    for n,v in d.items():
        g='M' if v['g']=='Masc' else 'F'
        k=evkey(v['ev'])
        rows=[]
        for r in v['rows']:
            if 'x' in r:
                if 'n' in r: rows.append({'x':r['x'],'s':getsw(r['n'],r['y'],g,club_id(r['club']))['id'],'c':club_id(r['club'])})
                continue
            c=club_id(r['club'])
            if k[0]!='R':
                s=getsw(r['n'],r['y'],g,c); s['c']=c if div=='dh' or s['c']==c else s['c']
                t=secs(r['t'])
                if k not in s['t'] or t<s['t'][k]: s['t'][k]=t
                rows.append({'p':r['p'],'s':s['id'],'c':c,'t':t,'pts':r['pts']})
            else:
                dist=re.match(r'R(\d+)',k).group(1)
                ids=[]
                for i,(nm,yb,lt) in enumerate(r['sw']):
                    s=getsw(nm,yb,g,c); ids.append(s['id'])
                    stroke = ['E','B','M','L'][i] if k.endswith('X') else 'L'
                    ek=dist+stroke
                    try: lt=secs(lt)
                    except: continue
                    est=lt+(0 if i==0 else FLY[dist])
                    if ek not in s['e'] or est<s['e'][ek]: s['e'][ek]=round(est,2)
                rows.append({'p':r['p'],'c':c,'t':secs(r['t']),'pts':r['pts'],'sw':ids})
        res[div][int(n)]={'g':g,'k':k,'rows':rows}
swl=sorted(sw.values(),key=lambda s:s['id'])
for s in swl:
    s['e']={k:v for k,v in s['e'].items() if k not in s['t']}
    if not s['e']: del s['e']
clubs=[dict(id=c[0],n=c[2],s=c[3],a=c[4],c1=c[5],c2=c[6],city=c[7]) for c in CLUBS]
out={'clubs':clubs,'swimmers':swl,'res2025':res}
js='window.COPA_DATA='+json.dumps(out,ensure_ascii=False,separators=(',',':'))+';\n'
open('/home/claude/copa/data.js','w').write(js)
print(len(swl),len(js))
print([s for s in swl if 'Yago' in s['n']])
