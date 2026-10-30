import {load} from 'cheerio'
import {z} from 'zod'
import {fetchPublic,publicUrl} from './public-fetch.server'
export function extractPageReference(html:string,pageUrl:URL){
 const $=load(html);const title=($('meta[property="og:title"]').attr('content')||$('meta[name="twitter:title"]').attr('content')||$('h1').first().text()||$('title').text()).trim().slice(0,120)
 let image=$('meta[property="og:image:secure_url"]').attr('content')||$('meta[property="og:image"]').attr('content')||$('meta[name="twitter:image"]').attr('content')||$('meta[name="twitter:image:src"]').attr('content')
 if(!image){$('script[type="application/ld+json"]').each((_i,el)=>{if(image)return;try{image=productImage(JSON.parse($(el).text()))}catch{/* A malformed structured-data block does not prevent other metadata from working. */}})}
 if(!image){const el=$('[itemprop="image"],main img,[role="main"] img').filter((_i,el)=>! /logo|icon|badge|avatar|sprite/i.test(($(el).attr('alt')||'')+' '+($(el).attr('src')||''))).first();image=el.attr('content')||el.attr('data-src')||el.attr('src')}
 if(!image)throw new Error('This page does not share a product image. Upload a reference photo instead.')
 const url=new URL(image,pageUrl);if(url.protocol==='http:')url.protocol='https:';return {title,imageUrl:publicUrl(url)}
}
function productImage(value:unknown,depth=0):string|undefined{if(!value||typeof value!=='object'||depth>6)return;if(Array.isArray(value)){for(const entry of value){const image=productImage(entry,depth+1);if(image)return image}return}const obj=value as Record<string,unknown>;if(obj['@type']==='Product'||(Array.isArray(obj['@type'])&&obj['@type'].includes('Product'))){const image=Array.isArray(obj.image)?obj.image[0]:obj.image;if(typeof image==='string')return image;if(image&&typeof image==='object'){const url=(image as Record<string,unknown>).url||(image as Record<string,unknown>).contentUrl;if(typeof url==='string')return url}}for(const child of Object.values(obj)){if(child&&typeof child==='object'){const image=productImage(child,depth+1);if(image)return image}}}
const shopifyProduct=z.object({title:z.string(),variants:z.array(z.object({id:z.union([z.string(),z.number()]),title:z.string().optional(),featured_image:z.object({src:z.string()}).nullable().optional()}))})
export async function importProduct(source:string){const url=publicUrl(source);const page=await fetchPublic(url,5_000_000);if(['image/jpeg','image/png','image/webp'].includes(page.type)){if(page.bytes.length>2_500_000)throw new Error('Use an image smaller than 2.5 MB.');return {bytes:page.bytes,type:page.type,title:'Image reference',notes:''}}
 if(!['text/html','application/xhtml+xml'].includes(page.type))throw new Error('Use a product page or a JPG, PNG or WebP image link.');const html=page.bytes.toString();let reference=extractPageReference(html,page.url);let notes='';
 const variantId=url.searchParams.get('variant');if(variantId&&/\/products\/[^/]+\/?$/.test(page.url.pathname)&&/cdn\.shopify\.com|Shopify\.shop/.test(html)){
  const productUrl=new URL(page.url);productUrl.pathname=productUrl.pathname.replace(/\/$/,'')+'.js';productUrl.search='';
  try{const result=await fetchPublic(productUrl,3_000_000);const product=shopifyProduct.safeParse(JSON.parse(result.bytes.toString()));if(product.success){const variant=product.data.variants.find(v=>String(v.id)===variantId);if(!variant)throw new Error('The selected product variant is unavailable. Upload its photo instead.');if(variant.featured_image?.src)reference={title:`${product.data.title}${variant.title?` — ${variant.title}`:''}`.slice(0,120),imageUrl:publicUrl(new URL(variant.featured_image.src,page.url))};notes=variant.title?`Selected product variant: ${variant.title}`:''}}catch(error){throw new Error('Could not verify the selected product variant. Upload its photo instead.',{cause:error})}
 }
 const image=await fetchPublic(reference.imageUrl,2_500_000);if(!['image/jpeg','image/png','image/webp'].includes(image.type))throw new Error('This page uses an unsupported image format. Upload a JPG, PNG or WebP instead.');return {bytes:image.bytes,type:image.type,title:reference.title||'Product reference',notes}
}
