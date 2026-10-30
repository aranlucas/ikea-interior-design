import {describe,it,expect,beforeAll,afterAll,vi} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {buildPrompt,designInput} from './validation'
import {seal,unseal,user,authorizationRedirect} from './auth.server'
const dir=mkdtempSync(join(tmpdir(),'roomform-'))
beforeAll(()=>{process.env.DATA_DIR=dir;process.env.SESSION_SECRET='test-session-secret-with-at-least-32-characters';process.env.DEV_AUTH_BYPASS='false'})
afterAll(()=>rmSync(dir,{recursive:true,force:true}))
describe('private studio',()=>{
 it('isolates media and room records by identity and commits room updates atomically',async()=>{const s=await import('./storage.server');const a=s.ownerPrefix('a');const b=s.ownerPrefix('b');await s.save(a+'photo.png',new Uint8Array([1,2,3]),'image/png');expect(await s.load(b+'photo.png')).toBeNull();expect(Array.from((await s.load(a+'photo.png'))!)).toEqual([1,2,3]);await s.mutateRooms('a',all=>{all.push({id:crypto.randomUUID(),name:'Room',type:'Living',notes:'',style:'Japandi',assets:[],designs:[],createdAt:new Date().toISOString()})});expect(await s.rooms('b')).toEqual([]);await expect(s.mutateRooms('a',all=>{all[0].name='Wrong';throw new Error('abort')})).rejects.toThrow('abort');expect((await s.rooms('a'))[0].name).toBe('Room')})
 it('prevents simultaneous generations for the same user',async()=>{const s=await import('./storage.server');expect(s.claimGeneration('a')).toBe(true);expect(s.claimGeneration('a')).toBe(false);expect(s.claimGeneration('b')).toBe(true);s.releaseGeneration('a');expect(s.claimGeneration('a')).toBe(true)})
 it('rejects tampered or expired sessions and authenticates a valid identity',async()=>{const token=await seal({sub:'a',name:'Alex'});expect((await unseal(token))?.sub).toBe('a');expect(await unseal(token.slice(0,-8)+'tampered')).toBeNull();expect(await unseal(await seal({sub:'a'},'-1s'))).toBeNull();expect(await user(new Request('http://localhost',{headers:{cookie:`roomform_session=${token}`}}))).toEqual({sub:'a',name:'Alex',email:undefined});expect(await user(new Request('http://localhost'))).toBeNull()})
 it('keeps image reference numbers aligned with architectural context',()=>{const input=designInput.parse({roomId:crypto.randomUUID(),baseId:crypto.randomUUID(),notes:'Add the sofa',style:'Japandi',assetIds:[]});const p=buildPrompt('Living room',input,[{name:'Sofa',kind:'product'}],3);expect(p).toContain('Image 4: product, Sofa');expect(p).toContain('Preserve its architecture');expect(p).toContain('Add the sofa')})
})

describe('Better Auth browser handoff',()=>{
 it('opens the signed sign-in page supplied by the provider JSON response',async()=>{const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({redirect:true,url:'/auth/sign-in?sig=provider-signed'}));try{expect(await authorizationRedirect(new URL('https://auth.example/api/auth/oauth2/authorize'))).toBe('https://auth.example/auth/sign-in?sig=provider-signed')}finally{fetchMock.mockRestore()}})
 it('rejects external destinations from the authorization response',async()=>{const fetchMock=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(Response.json({redirect:true,url:'https://untrusted.example/auth/sign-in'}));try{await expect(authorizationRedirect(new URL('https://auth.example/api/auth/oauth2/authorize'))).rejects.toThrow('unexpected login destination')}finally{fetchMock.mockRestore()}})
})
