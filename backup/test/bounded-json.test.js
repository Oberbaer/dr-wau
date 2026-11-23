'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {measure,encode,EXPORT_BYTES}=require('../lib/bounded-json');
test('bounded serializer preserves UTF-8, escapes, JSON omissions and shared references',()=>{
 const shared={text:'é😀漢字\n\u0000"\\'.repeat(1000)};
 const value={first:shared,second:shared,missing:undefined,empty:{toJSON:()=>undefined},array:[undefined,NaN,Infinity,-0],date:new Date('2026-01-01Z'),surrogates:'\uD800\uDC00\uD800',split:'a'.repeat(4095)+'😀'};
 const expected=JSON.stringify(value);assert.equal(encode(value).toString(),expected);assert.equal(measure(value),Buffer.byteLength(expected));
});
test('size, depth, cycles, BigInt and unstable serialization reject before publication',()=>{
 let allocated=false;assert.throws(()=>encode({text:'x'.repeat(EXPORT_BYTES+1)},undefined,()=>allocated=true),/size limit/);assert.equal(allocated,false);
 assert.throws(()=>encode({text:'x'.repeat(100)},20),/size limit/);
 const cycle={};cycle.self=cycle;assert.throws(()=>encode(cycle),/safely/);
 let deep={};for(let i=0;i<70;i++)deep={child:deep};assert.throws(()=>encode(deep),/safely/);
 assert.throws(()=>encode({value:1n}),/safely/);
 let calls=0;assert.throws(()=>encode({toJSON:()=>({value:'x'.repeat(++calls)})}),/safely/);
});
