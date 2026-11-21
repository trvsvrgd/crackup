import * as THREE from 'three';

import type { Tier4Snapshot } from '../../shared/world/tier4World.js';

import type { AgentPhysicsBody } from '../../shared/physics/characterController.js';

import { LORE_COLLECTIBLE_REGISTRY,SANDBOX_ACTIVITY_REGISTRY } from '../../shared/content/activitiesAndCollectiblesRegistry.js';

import { TIER4_GLASS_REGISTRY,TIER4_LIFT_REGISTRY } from '../../shared/content/tier4WorldGeometry.js';

import { HumanoidRig } from '../animation/humanoidRig.js';

import { AugmentChassisId } from '../../shared/constants.js';

const distance=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number})=>Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);

/** Registered world objects plus an inspectable field journal; rewards always come from PLAYER_STATE. */

export class Tier4WorldRenderer {

  public readonly root=new THREE.Group();

  private readonly objects=new Map<string,THREE.Object3D>();

  private readonly vehicles=new Map<number,THREE.Group>();

  private readonly dynamic=new Map<string,THREE.Object3D>();

  private readonly panel=document.createElement('section');

  private readonly readout=document.createElement('div');

  private readonly journal=document.createElement('details');

  private readonly select=document.createElement('select');

  private readonly transcript=document.createElement('p');

  private readonly nursery:HumanoidRig[]=[];
  private readonly civilians=new Map<string,HumanoidRig>();

  private readonly steel=new THREE.MeshStandardMaterial({color:0x294655,metalness:.7,roughness:.35});

  private readonly cyan=new THREE.MeshStandardMaterial({color:0x60e8ed,emissive:0x147d8e,emissiveIntensity:.8});

  private readonly amber=new THREE.MeshStandardMaterial({color:0xffbb5e,emissive:0xaa5500,emissiveIntensity:.5});

  private signature='';private selected='';private readable=new Set<string>();

  constructor(scene:THREE.Scene){

    this.root.name='Tier 4 combat ecology';scene.add(this.root);

    this.panel.id='tier4-field-journal';this.panel.style.cssText='position:fixed;right:20px;top:235px;width:295px;max-height:48vh;overflow:auto;padding:10px 12px;color:#dbf8ff;background:#07131eea;border-left:2px solid #59cfe3;font:12px/1.5 monospace;z-index:12;display:none';

    this.readout.style.whiteSpace='pre-line';const summary=document.createElement('summary');summary.textContent='Field journal · track content / read recovered lore';this.journal.append(summary,this.select,this.transcript);this.select.setAttribute('aria-label','Track operation or inspect recovered lore');this.select.style.cssText='width:100%;background:#112936;color:white;margin-top:8px';this.select.onchange=()=>{this.selected=this.select.value;this.panel.dataset.track=this.selected;const c=LORE_COLLECTIBLE_REGISTRY.find(c=>c.id===this.selected);this.transcript.textContent=c?(this.readable.has(c.id)?c.transcript:'Recover this record to read its transcript.'):'';};this.panel.append(this.readout,this.journal);document.body.append(this.panel);

    for(const c of LORE_COLLECTIBLE_REGISTRY){const group=new THREE.Group();group.name=c.title;group.position.copy(c.position);

      if(c.set==='CHIMERA_LOG'){this.box(group,.55,.3,.35,this.steel);this.box(group,.3,.06,.37,this.amber,0,.08,0);}

      else if(c.set==='SOMNA_DOSSIER'){this.box(group,.3,.4,.04,this.cyan);for(let i=0;i<3;i++)this.box(group,.24,.035,.05,this.steel,0,.1-i*.1,0);}

      else{const tag=new THREE.Mesh(new THREE.CapsuleGeometry(.11,.18,3,6),this.amber);tag.rotation.z=Math.PI/2;group.add(tag);const loop=new THREE.Mesh(new THREE.TorusGeometry(.1,.015,5,12),this.steel);loop.position.y=.2;group.add(loop);}

      this.objects.set(c.id,group);this.root.add(group);

    }

    for(const s of SANDBOX_ACTIVITY_REGISTRY)for(const [i,p]of s.checkpoints.entries()){

      const group=new THREE.Group();group.position.copy(p);group.name=`${s.name} / ${i+1}`;

      if(s.kind==='RINGS'){const ring=new THREE.Mesh(new THREE.TorusGeometry(5,.13,8,36),this.cyan);group.add(ring);const next=s.checkpoints[i+1]??s.checkpoints[Math.max(0,i-1)];group.lookAt(next.x,next.y,next.z);}

      else if(s.kind==='RACE'){for(const side of [-1,1])this.box(group,.2,4,.2,this.amber,side*6,2,0);this.box(group,12,.2,.2,this.amber,0,4,0);}

      else{const ring=new THREE.Mesh(new THREE.RingGeometry(22,22.4,48),this.amber);ring.rotation.x=-Math.PI/2;ring.position.y=.05;group.add(ring);}

      this.objects.set(`${s.id}:${i}`,group);this.root.add(group);

    }

    for(const g of TIER4_GLASS_REGISTRY){const mesh=new THREE.Mesh(new THREE.BoxGeometry(g.half.x*2,g.half.y*2,g.half.z*2),new THREE.MeshPhysicalMaterial({color:0x81c8df,transparent:true,opacity:.27,metalness:.15,roughness:.1}));mesh.position.copy(g.position);this.objects.set(g.id,mesh);this.root.add(mesh);}

    for(const l of TIER4_LIFT_REGISTRY){const group=new THREE.Group();this.box(group,5,.5,5,this.steel);for(const x of [-2.3,2.3])this.box(group,.08,1.1,4.8,this.amber,x,.7,0);group.position.copy(l.position);this.objects.set(l.id,group);this.root.add(group);}

    for(let i=0;i<4;i++){const child=new HumanoidRig(AugmentChassisId.PACK_VANGUARD);child.weapon.visible=false;child.root.scale.setScalar(.55);child.root.position.set(-485+i*4,4,-0+382);child.root.visible=false;this.root.add(child.root);this.nursery.push(child);}

  }

  private box(parent:THREE.Object3D,w:number,h:number,d:number,m:THREE.Material,x=0,y=0,z=0):THREE.Mesh {const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;}

  private vehicle(id:number,variant:string):THREE.Group {

    const group=new THREE.Group();group.name=variant;

    if(variant==='VH_A06'){

      this.box(group,2.4,1.2,5.2,this.steel);this.box(group,1.6,.9,1.8,this.cyan,0,.45,-1.3);this.box(group,7,.16,1.3,this.steel,0,.2,.5);

      for(const side of [-1,1]){const duct=new THREE.Mesh(new THREE.TorusGeometry(1,.18,8,24),this.steel);duct.rotation.x=Math.PI/2;duct.position.set(side*2.8,.4,.5);group.add(duct);const rotor=this.box(group,1.8,.06,.12,this.amber,side*2.8,.4,.5);rotor.name='rotor';this.box(group,.15,.15,1.8,this.amber,side*1.2,-.5,-2);}

      this.box(group,.15,1.8,1.2,this.steel,0,.9,2);

    }else if(variant==='VH_G02'){

      this.box(group,.55,.55,1.7,this.steel,0,.1,0);this.box(group,.5,.4,.6,this.cyan,0,.6,-.3);

      for(const z of [-.9,.9]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.25,16),this.steel);wheel.rotation.z=Math.PI/2;wheel.position.set(0,-.35,z);group.add(wheel);}

      this.box(group,1,.08,.1,this.amber,0,.8,-.6);

    }else{

      this.box(group,2,1,4.6,this.steel);this.box(group,1.7,.8,1.5,this.cyan,0,.6,-.5);

      for(const x of [-1,1])for(const z of [-1.5,1.5]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.55,.55,.3,12),this.steel);wheel.rotation.z=Math.PI/2;wheel.position.set(x,-.45,z);group.add(wheel);}

      if(variant==='VH_G06'){this.box(group,1.3,.3,1.2,this.steel,0,1.2,.8);this.box(group,.15,.15,2,this.amber,0,1.3,-.4);}else this.box(group,.15,.2,2,this.amber,0,1,.6);

    }

    this.root.add(group);this.vehicles.set(id,group);return group;

  }

  public update(s:Tier4Snapshot|undefined,a:AgentPhysicsBody|undefined,time:number):void {

    this.root.visible=!!s&&!!a;this.panel.style.display=s&&a?'block':'none';if(!s||!a)return;this.readable=new Set(s.collectedLore);

    for(const c of LORE_COLLECTIBLE_REGISTRY){const o=this.objects.get(c.id)!;o.visible=!s.collectedLore.includes(c.id);o.rotation.y=time*.6;}

    for(const g of s.glass){const o=this.objects.get(g.id);if(o)o.visible=g.hp>0;}

    for(const l of s.lifts)this.objects.get(l.id)?.position.copy(l.position);

    for(const child of this.nursery)child.root.visible=s.nurseryRevealed;
    for(const [id,rig]of this.civilians)if(!s.citizens.some(c=>c.id===id)){rig.root.removeFromParent();rig.dispose();this.civilians.delete(id);}
    for(const c of s.citizens){let rig=this.civilians.get(c.id);if(!rig){rig=new HumanoidRig(AugmentChassisId.PACK_VANGUARD);rig.weapon.visible=false;rig.materials.armor.color.setHex(c.kind==='EVACUATE'?0xe0a54c:0x83a9ad);rig.root.scale.setScalar(.9);this.civilians.set(c.id,rig);this.root.add(rig.root);}rig.root.position.copy(c.position);rig.root.position.y=Math.max(0,c.position.y-1);if(c.kind==='EVACUATE'&&c.stage)rig.root.rotation.z=.7;}


    const alive=new Set(s.vehicles.map(v=>v.id));for(const [id,g]of this.vehicles)if(!alive.has(id)){g.removeFromParent();g.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});this.vehicles.delete(id);}

    for(const v of s.vehicles){const g=this.vehicles.get(v.id)??this.vehicle(v.id,v.variantId);g.position.copy(v.position);g.rotation.y=v.yaw;g.visible=v.hp>0;g.traverse(o=>{if(o.name==='rotor')o.rotation.y=time*30;});}

    const available=[...s.objectives,...s.markers];const focus=available.find(m=>m.id===this.selected)??s.objectives[0]??s.markers.filter(m=>m.kind==='MISSION').sort((x,y)=>distance(x.position,a.position)-distance(y.position,a.position))[0];

    const signature=available.map(m=>m.id).join('|')+'#'+s.collectedLore.join('|');

    if(signature!==this.signature){this.signature=signature;this.select.replaceChildren();const auto=document.createElement('option');auto.value='';auto.textContent='Track active objective automatically';this.select.append(auto);for(const m of available){const opt=document.createElement('option');opt.value=m.id;opt.textContent=m.label;this.select.append(opt);}for(const id of s.collectedLore){const c=LORE_COLLECTIBLE_REGISTRY.find(c=>c.id===id);if(!c)continue;const opt=document.createElement('option');opt.value=id;opt.textContent=`Read: ${c.title}`;this.select.append(opt);}this.select.value=this.selected;}

    const near=s.markers.filter(m=>distance(m.position,a.position)<10).sort((x,y)=>distance(x.position,a.position)-distance(y.position,a.position))[0];

    const lines=[`FIELD OPERATIONS · Lore ${s.collectedLore.length}/64 · Heat ${Math.round(s.heat)}`];if(focus)lines.push(`${focus.label}\n${Math.round(distance(focus.position,a.position))} m · altitude ${Math.round(focus.position.y)} m`);

    for(const o of s.objectives.slice(0,3))lines.push(`${o.label}${o.remaining!==undefined?` · ${Math.ceil(o.remaining)}s`:''}${o.hp!==undefined?` · ${Math.ceil(o.hp)} HP`:''}`);

    if(near)lines.push(near.label);lines.push(s.message);this.readout.textContent=lines.join('\n');

    const ids=new Set<string>();for(const o of [...s.targets.filter(t=>t.hp>0).map(t=>({id:t.id,label:'Infrastructure node',position:t.position})),...s.objectives,...s.markers.filter(m=>['MISSION','QUEST'].includes(m.kind)),...(focus?[focus]:[])]){

      ids.add(o.id);let mesh=this.dynamic.get(o.id);if(!mesh){const group=new THREE.Group();const node=o.id.includes('_NODE_');this.box(group,node?1.3:.065,node?2:2,node?1.3:.065,this.cyan,0,node?0:1.5,0);const halo=new THREE.Mesh(new THREE.TorusGeometry(node?.9:1.4,.06,6,20),this.amber);halo.rotation.x=Math.PI/2;halo.position.y=.15;group.add(halo);mesh=group;this.root.add(mesh);this.dynamic.set(o.id,mesh);}mesh.position.copy(o.position);if(!o.id.includes('_NODE_'))mesh.position.y-=.8;mesh.visible=distance(o.position,a.position)<400||focus?.id===o.id;

    }

    for(const [id,o]of this.dynamic)if(!ids.has(id)){o.removeFromParent();o.traverse(m=>{if(m instanceof THREE.Mesh)m.geometry.dispose();});this.dynamic.delete(id);}

  }

  public dispose():void {this.panel.remove();for(const child of this.nursery)child.dispose();for(const rig of this.civilians.values())rig.dispose();const materials=new Set<THREE.Material>();this.root.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});materials.forEach(m=>m.dispose());this.root.removeFromParent();}

}
