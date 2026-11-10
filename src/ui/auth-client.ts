import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {apiUrl,appLink} from '../links';
export type AuthConfig={mode:'email';url:string;key:string};
const config:AuthConfig={mode:'email',url:'https://rhugxohyhuvdsmrilijk.supabase.co',key:'sb_publishable__PmHrXLUJlCHfgF-I0azsg_yc27Nm_a'};
let client:SupabaseClient|undefined;
export async function authConfig(){return config}
export async function authClient(){return client??=createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'lab-life-email-session'}})}
export async function authFetch(input:string,init:RequestInit={}){const h=new Headers(init.headers);h.set('apikey',config.key);if(!h.has('Authorization')){const sdk=await authClient();const {data,error}=await sdk.auth.getSession();if(error)throw error;if(data.session)h.set('Authorization','Bearer '+data.session.access_token)}return fetch(apiUrl(input),{...init,headers:h})}
export async function signOut(){await(await authClient()).auth.signOut();location.href=appLink()}
