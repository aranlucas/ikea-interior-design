import {lookup} from 'node:dns/promises'
import {isIP} from 'node:net'
import {request} from 'node:https'
import type {IncomingMessage} from 'node:http'
import ipaddr from 'ipaddr.js'
export function publicUrl(value:string|URL){const url=new URL(value);const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();if(url.protocol!=='https:'||url.port||url.username||url.password||isIP(host)||!host.includes('.')||/\.(localhost|local|internal)\.?$/.test(host))throw new Error('Use a public HTTPS product or image URL.');return url}
export function isPublicAddress(address:string){try{return ipaddr.process(address).range()==='unicast'}catch{return false}}
export async function fetchPublic(value:string|URL,maxBytes:number,redirects=0):Promise<{bytes:Buffer;type:string;url:URL}>{
 const url=publicUrl(value);const addresses=await lookup(url.hostname,{all:true});if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new Error('Private network addresses are not supported.');
 // Pin the connection to the checked DNS results, retaining the hostname for TLS verification.
 const response=await new Promise<IncomingMessage>((resolve,reject)=>{const req=request(url,{agent:false,signal:AbortSignal.timeout(15000),headers:{'User-Agent':'Roomform/1.0 (product image importer)','Accept':'text/html,application/json,image/jpeg,image/png,image/webp;q=0.9,*/*;q=0.5','Accept-Encoding':'identity'},lookup:(_host,options,callback)=>{const address=addresses[0];callback(null,options.all?addresses:address.address,address.family)}},resolve);req.on('error',reject);req.end()});
 if([301,302,303,307,308].includes(response.statusCode||0)){response.destroy();if(redirects>=3||!response.headers.location)throw new Error('This page redirects too often. Upload a product photo instead.');return fetchPublic(new URL(response.headers.location,url),maxBytes,redirects+1)}
 if(!response.statusCode||response.statusCode<200||response.statusCode>=300){response.destroy();throw new Error('This website could not share an image. Upload a product photo instead.')}
 if(Number(response.headers['content-length'])>maxBytes){response.destroy();throw new Error('This reference is too large. Upload a smaller photo instead.')}
 const chunks:Buffer[]=[];let length=0;for await(const chunk of response){const bytes=Buffer.from(chunk);length+=bytes.length;if(length>maxBytes){response.destroy();throw new Error('This reference is too large. Upload a smaller photo instead.')}chunks.push(bytes)}return {bytes:Buffer.concat(chunks),type:(response.headers['content-type']||'').split(';')[0].trim().toLowerCase(),url}
}
