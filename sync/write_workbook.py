"""Append/update only 1riichi-owned worksheet XML; preserve all other ZIP parts."""
import ast,copy,hashlib,json,os,re,shutil,sys,tempfile,zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from datetime import datetime,timezone
S='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
R='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
P='http://schemas.openxmlformats.org/package/2006/relationships'
C='http://schemas.openxmlformats.org/package/2006/content-types'
ET.register_namespace('',S);ET.register_namespace('r',R)
def col(n):
 out=''
 while n:n,r=divmod(n-1,26);out=chr(65+r)+out
 return out
def xml(root):return ET.tostring(root,encoding='utf-8',xml_declaration=True)
def write_workbook(path,sheets,backup_dir):
 path=Path(path);backup_dir=Path(backup_dir)
 if path.with_name('~$'+path.name).exists():raise RuntimeError('Workbook is open in Excel; close it and the next sync will retry.')
 original=path.read_bytes();digest=hashlib.sha256(original).hexdigest()
 import io
 with zipfile.ZipFile(io.BytesIO(original)) as archive:
  parts={name:archive.read(name) for name in archive.namelist()}
 wb=ET.fromstring(parts['xl/workbook.xml']);rels=ET.fromstring(parts['xl/_rels/workbook.xml.rels']);types=ET.fromstring(parts['[Content_Types].xml'])
 sheet_list=wb.find(f'{{{S}}}sheets')
 targets={e.get('Id'):e.get('Target') for e in rels}
 def sheet_path(entry):
  target=targets[entry.get(f'{{{R}}}id')];return target.lstrip('/') if target.startswith('/') else 'xl/'+target
 template=next((e for e in sheet_list if e.get('name')=='Template'),None)
 if template is None:raise RuntimeError('Workbook Template sheet is missing.')
 template_xml=ET.fromstring(parts[sheet_path(template)])
 styles={c.get('r'):c.get('s') for c in template_xml.findall(f'.//{{{S}}}c')}
 shared_strings=[]
 if 'xl/sharedStrings.xml' in parts:
  shared_strings=[''.join(t.text or '' for t in item.iter(f'{{{S}}}t')) for item in ET.fromstring(parts['xl/sharedStrings.xml'])]
 def cell_text(cell):
  if cell is None:return ''
  if cell.get('t')=='s':
   value=cell.find(f'{{{S}}}v')
   return shared_strings[int(value.text)] if value is not None else ''
  return ''.join(cell.itertext())
 def text_at(root,ref):
  cell=root.find(f'.//{{{S}}}c[@r="{ref}"]')
  return cell_text(cell)
 changed=[];new_entries=[]
 for model in sheets:
  fingerprint=hashlib.sha256(('template-v3:'+json.dumps(model,sort_keys=True,ensure_ascii=False)).encode()).hexdigest()
  existing=None
  for entry in sheet_list:
   root=ET.fromstring(parts[sheet_path(entry)])
   marker_cell=next((c for c in root.findall(f'.//{{{S}}}c') if cell_text(c)==model['marker']),None)
   if marker_cell is not None:existing=(entry,root,marker_cell.get('r'));break
  if existing and text_at(existing[1],re.sub(r'\d+',lambda m:str(int(m.group())+1),existing[2]))==fingerprint:continue
  if existing:entry,root,_=existing;target=sheet_path(entry)
  else:
   if any(e.get('name')==model['name'] for e in sheet_list):raise RuntimeError('Worksheet name collision; no existing sheet was overwritten.')
   number=max([int(e.get('sheetId')) for e in sheet_list]+[0])+1
   target=f'xl/worksheets/riichi{number}.xml';rid=f'rIdRiichi{number}'
   while rid in targets:number+=1;rid=f'rIdRiichi{number}';target=f'xl/worksheets/riichi{number}.xml'
   entry=ET.SubElement(sheet_list,f'{{{S}}}sheet',{'name':model['name'],'sheetId':str(number),f'{{{R}}}id':rid})
   new_entries.append(entry)
   ET.SubElement(rels,f'{{{P}}}Relationship',{'Id':rid,'Type':R+'/worksheet','Target':target[3:]});targets[rid]=target[3:]
   ET.SubElement(types,f'{{{C}}}Override',{'PartName':'/'+target,'ContentType':'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'})
  root=ET.Element(f'{{{S}}}worksheet')
  ET.SubElement(root,f'{{{S}}}dimension',{'ref':model['range']})
  views=ET.SubElement(root,f'{{{S}}}sheetViews');view=ET.SubElement(views,f'{{{S}}}sheetView',{'workbookViewId':'0'})
  ET.SubElement(view,f'{{{S}}}pane',{'ySplit':'10','topLeftCell':'A11','activePane':'bottomLeft','state':'frozen'})
  ET.SubElement(root,f'{{{S}}}sheetFormatPr',{'defaultRowHeight':'15'})
  columns=ET.SubElement(root,f'{{{S}}}cols')
  for i in range(len(model['values'][0])):
   if 3<=i<3+model['playerCount']*3:width=[11.3,1.3,8][(i-3)%3]
   elif i>=4+model['playerCount']*3:width=20 if i==7+model['playerCount']*3 else 16
   else:width=8 if i==1 else 3
   ET.SubElement(columns,f'{{{S}}}col',{'min':str(i+1),'max':str(i+1),'width':str(width),'customWidth':'1'})
  data=ET.SubElement(root,f'{{{S}}}sheetData');values={};formulas={}
  for row,line in enumerate(model['values'],1):
   for i,value in enumerate(line,1):
    ref=f'{col(i)}{row}';f=model['formulas'][row-1][i-1]
    if f:formulas[ref]=f[1:]
    elif value!='':values[ref]=value
  values['B6']=fingerprint
  def number(ref,stack=()):
   if ref in stack:raise RuntimeError('Circular export formula')
   if ref not in formulas:return values.get(ref,0) if isinstance(values.get(ref,0),(int,float)) else 0
   formula=formulas[ref]
   def sum_range(match):
    c,a,b=match.group(1),int(match.group(2)),int(match.group(3))
    return str(sum(number(f'{c}{r}',stack+(ref,)) for r in range(a,b+1)))
   formula=re.sub(r'SUM\(([A-Z]+)(\d+):\1(\d+)\)',sum_range,formula)
   formula=re.sub(r'[A-Z]+\d+',lambda m:str(number(m.group(),stack+(ref,))),formula)
   def calc(node):
    if isinstance(node,ast.Constant) and isinstance(node.value,(int,float)):return node.value
    if isinstance(node,ast.UnaryOp) and isinstance(node.op,ast.USub):return -calc(node.operand)
    if isinstance(node,ast.BinOp):
     a,b=calc(node.left),calc(node.right)
     if isinstance(node.op,ast.Add):return a+b
     if isinstance(node.op,ast.Sub):return a-b
     if isinstance(node.op,ast.Mult):return a*b
    raise RuntimeError('Unsupported generated formula')
   return round(calc(ast.parse(formula,mode='eval').body),8)
  for row in range(1,len(model['values'])+1):
   height=37 if row==8 else 40 if row==9 else 24 if row in [1,2,3,7] else 18 if row==10 else 15
   rowxml=ET.SubElement(data,f'{{{S}}}row',{'r':str(row),'ht':str(height),'customHeight':'1',**({'hidden':'1'} if row in [5,6] else {})})
   for i in range(1,len(model['values'][0])+1):
    ref=f'{col(i)}{row}'
    if ref not in values and ref not in formulas:continue
    style_ref=ref if model['playerCount']==4 else ('D8' if row==8 else 'D9' if row==9 else 'D10' if row==10 else 'D12' if row>=12 and row%2==0 else 'F13')
    attrs={'r':ref};style=styles.get(style_ref)
    if style is not None:attrs['s']=style
    if row==7:attrs['s']=styles.get('M7','0')
    cell=ET.SubElement(rowxml,f'{{{S}}}c',attrs)
    if ref in formulas:ET.SubElement(cell,f'{{{S}}}f').text=formulas[ref];ET.SubElement(cell,f'{{{S}}}v').text=str(number(ref))
    elif isinstance(values[ref],(int,float)):ET.SubElement(cell,f'{{{S}}}v').text=str(values[ref])
    else:cell.set('t','inlineStr');ET.SubElement(ET.SubElement(cell,f'{{{S}}}is'),f'{{{S}}}t').text=str(values[ref])
  merges=ET.SubElement(root,f'{{{S}}}mergeCells')
  def merge(ref):ET.SubElement(merges,f'{{{S}}}mergeCell',{'ref':ref})
  for j in range(model['playerCount']):
   a,b=col(4+j*3),col(6+j*3)
   for row in [7,8,9,10]:merge(f'{a}{row}:{b}{row}')
  for row in range(12,12+model['gameCount']*2,2):
   for c in ['B']+[col(4+j*3) for j in range(model['playerCount'])]+[col(5+model['playerCount']*3),col(7+model['playerCount']*3)]:merge(f'{c}{row}:{c}{row+1}')
  merges.set('count',str(len(merges)))
  if model['playerCount']==4 and model['gameCount']<=20:
   # Use the actual Template XML, including its instruction text, cell styles,
   # borders, merged ranges, column widths, row heights and print settings.
   generated=root;root=copy.deepcopy(template_xml);template_data=root.find(f'{{{S}}}sheetData')
   rowmap={int(r.get('r')):r for r in template_data}
   template_cells={c.get('r'):c for c in root.findall(f'.//{{{S}}}c')}
   for r in range(12,51,2):
    for c in ['D','G','J','M','Q','S']:
     cell=template_cells.get(f'{c}{r}')
     if cell is not None:
      for child in list(cell):cell.remove(child)
      cell.attrib.pop('t',None)
   def place_cell(cell,row):
    ref=cell.get('r');prior=template_cells.get(ref)
    if prior is not None:
     # Retain the exact template cell style and other formatting attributes.
     style=prior.get('s');index=list(rowmap[row]).index(prior);rowmap[row].remove(prior)
     if style is not None:cell.set('s',style)
     rowmap[row].insert(index,cell)
    else:
     if row not in rowmap:rowmap[row]=ET.SubElement(template_data,f'{{{S}}}row',{'r':str(row)})
     rowmap[row].append(cell)
   for generated_row in generated.find(f'{{{S}}}sheetData'):
    r=int(generated_row.get('r'))
    if r<7:continue
    for cell in generated_row:
     if r==7 and cell.get('r')!='M7':continue
     place_cell(copy.deepcopy(cell),r)
   metadata_row=max(rowmap)+2
   for offset,value in enumerate([model['marker'],fingerprint]):
    r=metadata_row+offset;rowxml=ET.SubElement(template_data,f'{{{S}}}row',{'r':str(r),'hidden':'1'})
    cell=ET.SubElement(rowxml,f'{{{S}}}c',{'r':f'B{r}','t':'inlineStr'});ET.SubElement(ET.SubElement(cell,f'{{{S}}}is'),f'{{{S}}}t').text=value
   # Sort cells added to previously empty template rows into column order.
   def cell_order(c):
    value=0
    for letter in re.match(r'[A-Z]+',c.get('r')).group():value=value*26+ord(letter)-64
    return value
   for rowxml in template_data:rowxml[:]=sorted(rowxml,key=cell_order)
   root.find(f'{{{S}}}dimension').set('ref',f'A1:Z{metadata_row+1}')
   template_target=sheet_path(template);relationship_path=template_target.rsplit('/',1)[0]+'/_rels/'+template_target.rsplit('/',1)[1]+'.rels'
   if relationship_path in parts:parts[target.rsplit('/',1)[0]+'/_rels/'+target.rsplit('/',1)[1]+'.rels']=parts[relationship_path]
  parts[target]=xml(root);changed.append(model['name'])
 if not changed:return []
 calc=wb.find(f'{{{S}}}calcPr')
 if calc is None:calc=ET.SubElement(wb,f'{{{S}}}calcPr')
 calc.set('fullCalcOnLoad','1')
 workbook_text=parts['xl/workbook.xml'].decode('utf-8')
 from xml.sax.saxutils import quoteattr
 additions=''.join('<sheet name='+quoteattr(e.get('name'))+' sheetId='+quoteattr(e.get('sheetId'))+' r:id='+quoteattr(e.get(f'{{{R}}}id'))+'/>' for e in new_entries)
 if '</sheets>' not in workbook_text:raise RuntimeError('Unsupported workbook XML namespace layout')
 workbook_text=workbook_text.replace('</sheets>',additions+'</sheets>')
 parts['xl/workbook.xml']=workbook_text.encode('utf-8');parts['xl/_rels/workbook.xml.rels']=xml(rels);parts['[Content_Types].xml']=xml(types)
 backup_dir.mkdir(parents=True,exist_ok=True)
 backup=backup_dir/(datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')+'.xlsx');backup.write_bytes(original)
 fd,temp=tempfile.mkstemp(prefix='.1riichi-',suffix='.xlsx',dir=path.parent);os.close(fd)
 try:
  with zipfile.ZipFile(temp,'w',zipfile.ZIP_DEFLATED) as archive:
   for name,content in parts.items():archive.writestr(name,content)
  with zipfile.ZipFile(temp) as archive:
   if archive.testzip() is not None:raise RuntimeError('Workbook ZIP verification failed')
  if hashlib.sha256(path.read_bytes()).hexdigest()!=digest:raise RuntimeError('Workbook changed during sync; retrying next time.')
  os.replace(temp,path)
 finally:
  if os.path.exists(temp):os.unlink(temp)
 return changed
if __name__=='__main__':
 sys.stdout.reconfigure(encoding='utf-8')
 sys.stdin.reconfigure(encoding='utf-8')
 config=json.load(sys.stdin)
 try:print(json.dumps({'updated':write_workbook(config['workbook'],config['sheets'],config['backup_dir'])}))
 except Exception as error:print(json.dumps({'error':str(error)}));sys.exit(1)
