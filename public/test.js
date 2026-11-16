const fs=require('fs'), vm=require('vm');
const html=fs.readFileSync('/mnt/data/v31work/openapi_agent_v4.html','utf8');
const start=html.indexOf('function repairUnclosedPropertyQuotes');
const end=html.indexOf('// Record original JSON numeric tokens',start);
const code=html.slice(start,end);
const sample=`Item Master
The Item Master message is a message from ZION to WCS designed to let the WCS understand every part and its specific attributes.

1\tmessageId\tUnique message number, every message must have a unique message number\tInteger\tYes
2\tmessageTimestamp\tThe timestamp the message was created - format ISO 8601: YYYY-MM-DDTHH:MM:SSZ\tDateTime\tYes
3\titems\tA list of all item masters in this message\tList<Complex>\tYes
3.1\tsku\tThe unique stock keeping unit (SKU) that identifies this item\tString(30)\tYes
3.2\tskuDesc\tThe description for this item\tString(80)\tNo
3.3\tbaseUnit\tThe base handling unit and its characteristics for this item\tComplex\tYes
3.3.1\tname\tThe name of the base handling unit, default value is EACH\tString(20)\tYes
3.3.2\tqty\tThe count of inventory items in the base unit, default value is 1\tInteger\tYes
3.3.3\tlength\tItem length, in inches\tDecimal\tYes
3.3.4\twidth\tItem width, in inches\tDecimal\tYes
3.3.5\theight\tItem height, in inches\tDecimal\tYes
3.3.6\t
weight

Item weight, in ounces\tDecimal\tYes
3.4\texpireDateRequired\tDoes this item require an expiration date on the inbound order\tBoolean\tYes
3.5\tlotRequired\tDoes this item require a lot code on the inbound order\tBoolean\tYes
3.6\trovoFlexPickable\tIs this item pickable by the Rovoflex robot, default is true\tBoolean\tYes

Example JSON
{
  "messageId": 234000100,
  "messageTimestamp": "2026-06-20T12:10:00Z",
  "items": [
    {"sku":"GL231432","baseUnit":{"qty":1}},
    {
      "sku": "CS3242",
      "baseUnit": {
        "qty: 1
      }
    }
  ]
}`;
const ctx={};vm.createContext(ctx);vm.runInContext(code+';this.repair=repairUnclosedPropertyQuotes;this.extract=extractJSON;',ctx);
const fixed=ctx.repair(sample); console.log('repaired',fixed.changed, fixed.text.includes('"qty": 1'));
const got=ctx.extract(fixed.text); console.log('keys',Object.keys(got.value),'items',got.value.items.length,'second qty',got.value.items[1].baseUnit.qty);
