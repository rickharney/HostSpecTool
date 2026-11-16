
const $=id=>document.getElementById(id);
let downloadName='openapi-3.1.yaml';
function quote(s){return JSON.stringify(String(s))}function scalar(v){if(v===null)return 'null';if(typeof v==='string')return quote(v);if(typeof v==='number'||typeof v==='boolean')return String(v);return quote(String(v))}
function yamlDump(value,indent=0){if(value&&typeof value==='object'&&Object.keys(value).length===1&&typeof value.__tgwRawNumber==='string')return value.__tgwRawNumber;const pad=' '.repeat(indent);if(Array.isArray(value)){if(!value.length)return '[]';return value.map(v=>{if(v&&typeof v==='object'&&typeof v.__tgwRawNumber!=='string'&&Object.keys(v).length){const body=yamlDump(v,indent+2).split('\n');return pad+'- '+body[0].trimStart()+(body.length>1?'\n'+body.slice(1).join('\n'):'')}return pad+'- '+yamlDump(v,indent+2)}).join('\n')}if(value&&typeof value==='object'){const entries=Object.entries(value);if(!entries.length)return '{}';return entries.map(([k,v])=>{const key=/^[A-Za-z_][A-Za-z0-9_-]*$/.test(k)?k:quote(k);if(v&&typeof v==='object'&&typeof v.__tgwRawNumber!=='string'&&Object.keys(v).length)return pad+key+':\n'+yamlDump(v,indent+2);return pad+key+': '+yamlDump(v,indent+2)}).join('\n')}return scalar(value)}
function infer(v){if(v===null)return {type:'null'};if(Array.isArray(v))return {type:'array',items:v.length?infer(v[0]):{}};if(typeof v==='object'){const properties={};for(const [k,x] of Object.entries(v))properties[k]=infer(x);return {type:'object',properties,required:Object.keys(v),additionalProperties:false}}if(typeof v==='number')return {type:Number.isInteger(v)?'integer':'number'};return {type:typeof v}}
function applyOverride(schema,path,type,description){const parts=path.split('.').map(x=>x.trim()).filter(Boolean);if(!parts.length)return;let cur=schema;for(let i=0;i<parts.length;i++){if(cur.type==='array')cur=cur.items;if(cur.type!=='object'){cur.type='object';cur.properties={};delete cur.items}cur.properties??={};const k=parts[i];cur.properties[k]??={type:'string'};if(i===parts.length-1){if(type!=='auto'){cur.properties[k].type=type;if(type==='object')cur.properties[k].properties??={};if(type==='array')cur.properties[k].items??={type:'string'};if(type!=='object')delete cur.properties[k].properties;if(type!=='array')delete cur.properties[k].items}if(description)cur.properties[k].description=description}else cur=cur.properties[k]}}

function repairUnclosedPropertyQuotes(raw){
  // Recover a common copy/paste typo such as:  "qty: 1,
  // Only inspect lines that begin like JSON property keys; valid quoted keys are unchanged.
  let changed=false;
  const text=raw.replace(/^(\s*)"([A-Za-z_$][\w$-]*)\s*:(?=\s*[^\"])/gm,(match,indent,key)=>{changed=true;return indent+'"'+key+'":'});
  return {text,changed};
}
function removeTrailingCommas(raw){
  // Remove commas immediately before } or ] outside JSON strings only.
  let out='',quoted=false,escape=false;
  for(let i=0;i<raw.length;i++){
    const c=raw[i];
    if(quoted){out+=c;if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue}
    if(c==='"'){quoted=true;out+=c;continue}
    if(c===','){
      let j=i+1;while(j<raw.length&&/\s/.test(raw[j]))j++;
      if(raw[j]==='}'||raw[j]===']')continue;
    }
    out+=c;
  }
  return out;
}
function extractJSON(s){
  // Only start at object braces. Confluence may contain unmatched [ or ] before JSON.
  // Try each opening brace independently, so malformed prose cannot hide a later sample.
  const candidates=[];
  for(let start=0;start<s.length;start++){
    if(s[start]!=='{')continue;
    const stack=[];let inString=false,escaped=false;
    for(let i=start;i<s.length;i++){
      const c=s[i];
      if(inString){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')inString=false;continue}
      if(c==='"'){inString=true;continue}
      if(c==='{'||c==='[')stack.push(c);
      else if(c==='}'||c===']'){
        if(stack.pop()!==(c==='}'?'{':'['))break;
        if(!stack.length){
          try{const raw=s.slice(start,i+1);const normalized=removeTrailingCommas(raw);const value=JSON.parse(normalized);
            if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length)
              candidates.push({value,start,end:i+1,normalized:normalized!==raw});
          }catch(e){}
          break;
        }
      }
    }
  }
  if(!candidates.length)throw Error('No valid JSON object was found. Check that the pasted Confluence content includes a complete sample JSON object with matching braces and quoted property names.');
  const score=c=>{
    const context=s.slice(Math.max(0,c.start-250),c.start);
    const heading=/(sample|example|payload|request\s*body|json)/i.test(context)?100000:0;
    return heading+JSON.stringify(c.value).length;
  };
  candidates.sort((a,b)=>score(b)-score(a));return candidates[0];
}
// Record original JSON numeric tokens, including 8.0, 1e3 and -0.0.
// JSON.parse alone loses this lexical distinction.
function numericTokens(json){
  const found=new Map();let i=0;
  const ws=()=>{while(/\s/.test(json[i]||'')&&i<json.length)i++};
  function stringToken(){const start=i++;while(i<json.length){if(json[i]==='\\'){i+=2;continue}if(json[i++]==='"')break}return JSON.parse(json.slice(start,i))}
  function value(path){ws();const c=json[i];
    if(c==='"'){stringToken();return}
    if(c==='{'){i++;ws();if(json[i]==='}'){i++;return}while(i<json.length){ws();const k=stringToken();ws();i++;value(path.concat(k));ws();if(json[i++]==='}')return}return}
    if(c==='['){i++;ws();if(json[i]===']'){i++;return}let n=0;while(i<json.length){value(path.concat(n++));ws();if(json[i++]===']')return}return}
    const m=json.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if(m){if(/[.eE]/.test(m[0]))found.set(JSON.stringify(path),m[0]);i+=m[0].length;return}
    const literal=json.slice(i).match(/^(?:true|false|null)/);if(literal){i+=literal[0].length;return}
    throw Error('Invalid JSON token');
  }
  value([]);return found;
}
function preserveNumberExamples(value,tokens,path=[]){
  if(typeof value==='number'){
    const original=tokens.get(JSON.stringify(path));
    return original===undefined?value:{__tgwRawNumber:original};
  }
  if(Array.isArray(value))return value.map((v,i)=>preserveNumberExamples(v,tokens,path.concat(i)));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,preserveNumberExamples(v,tokens,path.concat(k))]));
  return value;
}
function correctNumericSchema(schema,value,tokens,path=[]){
  if(typeof value==='number'&&tokens.has(JSON.stringify(path))){schema.type='number';return}
  if(Array.isArray(value)&&schema.items&&value.length)correctNumericSchema(schema.items,value[0],tokens,path.concat(0));
  else if(value&&typeof value==='object'&&schema.properties)
    for(const [k,v] of Object.entries(value))if(schema.properties[k])correctNumericSchema(schema.properties[k],v,tokens,path.concat(k));
}
function parseRequired(raw){
  const v=String(raw??'').trim().toLowerCase().replace(/[\s_-]+/g,'');
  if(['yes','y','true','t','x','1','required','requiredyes','requiredtrue','requiredx','mandatory'].includes(v))return true;
  if(['no','n','false','f','0','requiredno','requiredfalse','optional','notrequired'].includes(v))return false;
  return null;
}
function parseRows(s){
  const rows=[];
  const lines=s.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const index=/^\d+(?:\.\d+)*\.?$/;
  const headerName=/^(field|field name|name|key|property)$/i;
  const headerReq=/^(required|mandatory|required\?|is required)$/i;
  const typePattern=/^(root\s*(?:element|node)|datetime|date|integer|int|long|double|float|decimal(?:\s*\([^)]*\))?|number|string(?:\s*\[\s*\d+\s*\]|\s*\(\s*\d+\s*\)|\s+\d+)?|varchar2?\s*\(\s*\d+\s*\)|char\s*\(\s*\d+\s*\)|boolean|bool|object|array|list\s*<[^>]+>)$/i;
  function add(name,description,type,requiredRaw){
    if(!/^[$A-Za-z_][\w$-]*$/.test(name))return;
    rows.push({name,description:description||'',type:type||'',required:parseRequired(requiredRaw),requiredRaw:String(requiredRaw??'')});
  }
  function cellsOf(line){
    if(line.includes('\t'))return line.split('\t').map(x=>x.trim());
    if(/^\|/.test(line))return line.replace(/^\|+/,'').replace(/\|+$/,'').split(/\|{1,2}/).map(x=>x.trim());
    return null;
  }
  function isIndexLine(line){const cells=cellsOf(line);return index.test(cells?cells[0]:line);}
  // Tables copied from Confluence may have tab-separated cells, wiki pipes, or numbered rows.
  let headers=null;
  let lastTabRow=null;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];const cells=cellsOf(line);
    if(cells){
      // A copied Confluence cell can contain a line break. Keep continuation
      // text with the preceding description, and accept a wrapped type/required
      // pair (for example, "DateTime<TAB>Yes") on its own line.
      if(cells.length===2&&/^[$A-Za-z_][\w$-]*$/.test(cells[0])&&!typePattern.test(cells[0])){
        add(cells[0],cells[1],'','');
        lastTabRow=rows[rows.length-1]||null;
        continue;
      }
      if(lastTabRow&&cells.length===2&&typePattern.test(cells[0])&&parseRequired(cells[1])!==null){
        lastTabRow.type=cells[0];
        lastTabRow.required=parseRequired(cells[1]);
        lastTabRow.requiredRaw=String(cells[1]);
        continue;
      }
      const lower=cells.map(x=>x.toLowerCase().replace(/\s+/g,' ').trim());
      if(lower.some(x=>headerName.test(x))&&lower.some(x=>headerReq.test(x))){
        headers={name:lower.findIndex(x=>headerName.test(x)),required:lower.findIndex(x=>headerReq.test(x)),description:lower.findIndex(x=>/^(description|desc)$/.test(x)),type:lower.findIndex(x=>/^(data type|datatype|type)$/.test(x))};continue;
      }
      if(headers){
        const get=k=>headers[k]<0?'':(cells[headers[k]]||'');
        if(get('name')){add(get('name'),get('description'),get('type'),get('required'));continue}
      }
      const offset=index.test(cells[0])?1:0;
      if(cells.length-offset>=4){
        add(cells[offset],cells[offset+1],cells[offset+2],cells[offset+3]);
        lastTabRow=rows[rows.length-1]||null;
        continue;
      }
    } else if(lastTabRow&&!isIndexLine(line)&&!/^\s*(?:data fields|example json|sample\b)/i.test(line)){
      // Preserve wrapped description text verbatim; yamlDump will quote/escape
      // the newline safely when it serializes the description.
      lastTabRow.description+=(lastTabRow.description?'\n':'')+line;
      continue;
    }
    // Confluence's plain-text copy sometimes places each cell on its own line.
    if(!isIndexLine(line))continue;
    let j=i+1;if(j>=lines.length||!/^[$A-Za-z_][\w$-]*$/.test(lines[j]))continue;
    const name=lines[j++],tokens=[];
    while(j<lines.length&&!isIndexLine(lines[j])&&!/^Sample\b/i.test(lines[j])&&tokens.length<12){const tokenLine=lines[j++];const tokenCells=cellsOf(tokenLine);if(tokenCells)tokens.push(...tokenCells.filter(x=>x!==''));else tokens.push(tokenLine);}
    const reqIndex=tokens.findIndex(x=>parseRequired(x)!==null);
    if(reqIndex>=0){
      const before=tokens.slice(0,reqIndex);
      const typeIndex=before.findIndex(x=>typePattern.test(x));
      const type=typeIndex>=0?before[typeIndex]:'';
      const description=before.filter((_,k)=>k!==typeIndex).join(' ');
      add(name,description,type,tokens[reqIndex]);
    }
    i=j-1;
  }
  return rows;
}
function matchType(raw){const t=raw.trim().toLowerCase();if(!t||/^root\s*(?:element|node)$/.test(t))return null;if(/^varchar2?\s*\(\s*\d+\s*\)$/.test(t)||/^char\s*\(\s*\d+\s*\)$/.test(t))return {type:'string',maxLength:Number(t.match(/\(\s*(\d+)/)[1])};if(/^decimal(?:\s*\([^)]*\))?$/.test(t))return {type:'number'};if(t==='datetime')return {type:'string',format:'date-time'};if(t==='date')return {type:'string',format:'date'};if(['int','integer','long'].includes(t))return {type:'integer'};if(['float','double','decimal','number'].includes(t))return {type:'number'};if(['bool','boolean'].includes(t))return {type:'boolean'};if(/^string\s*(?:\[\s*\d+\s*\]|\(\s*\d+\s*\)|\s+\d+)$/.test(t))return {type:'string',maxLength:Number(t.match(/\d+/)[0])};if(t==='string')return {type:'string'};if(t.startsWith('list<')){const inner=t.slice(5,-1);return {type:'array',items:matchType(inner)||{type:'object'}}}if(t==='array')return {type:'array',items:{}};if(t==='object')return {type:'object'};return {type:'object'}}
function walkSchema(schema,parts){let cur=schema;for(const part of parts){if(cur.type==='array')cur=cur.items;if(!cur||cur.type!=='object'||!cur.properties||!cur.properties[part])return null;cur=cur.properties[part]}return cur}
function locate(schema,name){const hits=[];function visit(node,path){if(!node||typeof node!=='object')return;if(node.type==='array')visit(node.items,path);if(node.properties)for(const [k,v] of Object.entries(node.properties)){if(k===name)hits.push({node:v,parent:node,key:k,path:[...path,k]});visit(v,[...path,k])}}visit(schema,[]);return hits}
function applyRows(schema,rows){const warnings=[];for(const row of rows){const hits=locate(schema,row.name);if(!hits.length){warnings.push('Field not found in sample: '+row.name);continue}if(hits.length>1)warnings.push('Ambiguous repeated field: '+row.name);for(const hit of hits){const type=matchType(row.type);if(type){if(type.type===hit.node.type){if(type.format)hit.node.format=type.format;if(type.maxLength)hit.node.maxLength=type.maxLength;if(type.type==='array'&&hit.node.items&&type.items.type!=='object'&&type.items.type!==hit.node.items.type)warnings.push('Array item type mismatch: '+row.name)}else warnings.push('Type mismatch for '+row.name+': table='+row.type+', JSON='+hit.node.type)}if(row.description)hit.node.description=row.description;if(row.required!==null){const req=hit.parent.required||[];hit.parent.required=row.required?[...new Set([...req,hit.key])]:req.filter(x=>x!==hit.key)}}}return warnings}
function makeResponses(){const result={};for(const [status,desc,success,details] of [['200','Message processed successfully',true,null],['400','Message failed',false,'Message rejected because of formatting issue'],['500','Message failed',false,'Exception processing the message']])result[status]={description:desc,content:{'application/json':{schema:{$ref:'#/components/schemas/AcknowledgementResponse'},examples:{success:{value:{success,details}}}}}};return result}
function generate(){try{const sourceText=$('source').value.trim();if(!sourceText)throw Error('Paste the Confluence specification first.');const repaired=repairUnclosedPropertyQuotes(sourceText);const s=repaired.text;const found=extractJSON(s);const prefix=s.slice(0,found.start),rows=parseRows(prefix);const intro=prefix.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const title=intro[0]||'Imported JSON Service';downloadName=(title.normalize('NFKD').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||'openapi_3_1')+'.yaml';let desc=[];for(let i=1;i<intro.length;i++){if(/^\d+(?:\.\d+)*\.?(?:\s|$)/.test(intro[i])||/^Sample\b/i.test(intro[i]))break;desc.push(intro[i])}const description=desc.join(' ')||title;const payload=found.value;const tokens=numericTokens(removeTrailingCommas(s.slice(found.start,found.end)));let schema=infer(payload);correctNumericSchema(schema,payload,tokens);const warnings=applyRows(schema,rows);const examplePayload=preserveNumberExamples(payload,tokens);if(found.normalized)warnings.unshift('Trailing commas in the JSON example were removed for valid JSON output.');if(repaired.changed)warnings.unshift('A missing closing quote in a JSON property name was repaired (for example, \"qty: 1\" became \"qty\": 1). Please review the corrected example.');const method=$('method').value.toLowerCase();const path=$('path').value.trim()||'/'+title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');if(!path.startsWith('/'))throw Error('Endpoint must start with /.');const server=$('server').value.trim();if(server){const url=new URL(server);if(!['http:','https:'].includes(url.protocol))throw Error('Server must use http or https.')}const operation={summary:title,description,operationId:title.replace(/[^A-Za-z0-9]+/g,' ').trim().split(' ').map((x,i)=>i?x[0].toUpperCase()+x.slice(1):x.toLowerCase()).join(''),...( ['post','put','patch'].includes(method)?{requestBody:{required:true,content:{'application/json':{schema,example:examplePayload}}}}:{}),responses:makeResponses()};const spec={openapi:'3.1.0',info:{title,version:'1.0.0',description},...(server?{servers:[{url:server}]}:{}),paths:{[path]:{[method]:operation}},components:{schemas:{AcknowledgementResponse:{type:'object',properties:{success:{type:'boolean'},details:{type:['string','null']}},required:['success','details']}}}};$('yaml').value=yamlDump(spec)+'\n';$('download').disabled=false;$('copy').disabled=false;$('analysis').textContent='Title: '+title+'\nDescription: '+description+'\nMethod: '+method.toUpperCase()+'\nPath: '+path+' (inferred if not supplied)\nRoot JSON keys: '+Object.keys(payload).join(', ')+'\nFields found in Confluence table: '+rows.length+'\n'+rows.map(r=>'• '+r.name+' | '+(r.type||'inferred')+' | required='+(r.required===null?'unknown':r.required)+(r.description?' | '+r.description:'')).join('\n')+(warnings.length?'\n\nReview warnings:\n'+warnings.map(x=>'• '+x).join('\n'):'')+'\n\nNote: endpoint, method and requiredness should be verified against your actual service contract.';$('status').textContent='YAML generated. '+rows.length+' field definitions extracted.'+(warnings.length?' '+warnings.length+' warning(s) to review.':'');$('status').className='status ok';}catch(e){$('yaml').value='';$('download').disabled=true;$('copy').disabled=true;$('status').textContent=e.message;$('status').className='status error'}}
$('generate').onclick=generate;$('download').onclick=()=>{const blob=new Blob([$('yaml').value],{type:'application/yaml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=downloadName;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)};$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('yaml').value);$('status').textContent='YAML copied.'}catch(e){$('yaml').select();document.execCommand('copy');$('status').textContent='Select and copy the YAML.'}};
