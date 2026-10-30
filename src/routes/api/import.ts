import {createFileRoute} from '@tanstack/react-router'
import {requireUser,sameOrigin} from '../../lib/auth.server'
import {rooms,mutateRooms,save,remove,ownerPrefix} from '../../lib/storage.server'
import {importProduct} from '../../lib/product-import.server'
import {handle} from '../../lib/http.server'
import {z} from 'zod'
export const Route=createFileRoute('/api/import')({server:{handlers:{POST:({request})=>handle(async()=>{
 sameOrigin(request);const u=await requireUser(request);const input=z.object({roomId:z.uuid(),url:z.url(),name:z.string().max(120),kind:z.enum(['product','inspiration']).default('product'),dimensions:z.string().trim().max(200).default('')}).parse(await request.json());const room=(await rooms(u.sub)).find(r=>r.id===input.roomId);if(!room)throw new Response('Room not found',{status:404});if(room.assets.length>=16)throw new Error('A room can hold up to 16 photos.');
 const imported=await importProduct(input.url);const id=crypto.randomUUID();const key=`${ownerPrefix(u.sub)}${room.id}/${id}.${imported.type.split('/')[1]}`;await save(key,imported.bytes,imported.type);
 try{const updated=await mutateRooms(u.sub,all=>{const target=all.find(r=>r.id===room.id);if(!target)throw new Response('Room not found',{status:404});if(target.assets.length>=16)throw new Error('A room can hold up to 16 photos.');target.assets.push({id,key,name:input.name||imported.title,kind:input.kind,url:input.url,notes:imported.notes,dimensions:input.dimensions||imported.dimensions,availableSizes:imported.availableSizes});return target});return Response.json(updated)}catch(error){await remove(key);throw error}
})}}})
