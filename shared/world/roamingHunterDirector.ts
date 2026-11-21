import { DistrictId, EnemyCombatState, getDistrictForPosition } from '../constants.js';
import { HUNTER_RULES, BOSS_ENCOUNTER_REGISTRY } from '../content/enemyAndBossRegistry.js';
import type { AgentPhysicsBody } from '../physics/characterController.js';
import type { EnemyPhysicsEntity } from '../combat/enemyRigSystem.js';
import type { Vec3 } from '../protocol/binaryProtocol.js';
export interface HunterHost {
  spawnHunter(position:Vec3):{enemy:EnemyPhysicsEntity;vehicleIds:number[]};
  moveHunter(enemy:EnemyPhysicsEntity,target:Vec3,dt:number):void;
  updateHunterVehicles(ids:number[],enemy:EnemyPhysicsEntity,target:AgentPhysicsBody,dt:number):void;
  hunterDefeated(enemy:EnemyPhysicsEntity):void;
  completed(agent:AgentPhysicsBody,id:string):boolean;
}
export class RoamingHunterDirector {
  public enemy:EnemyPhysicsEntity|null=null; public targetId=0; public vehicleIds:number[]=[];
  public readonly heat=new Map<number,number>();
  constructor(private readonly host:HunterHost){}
  public addHeat(id:number,damage:number):void { if(Number.isFinite(damage)&&damage>0)this.heat.set(id,Math.min(200,(this.heat.get(id)??0)+damage*HUNTER_RULES.damageHeat)); }
  public step(dt:number,agents:Map<number,AgentPhysicsBody>):void {
    for(const [id,h]of this.heat) {if(!agents.has(id))this.heat.delete(id);else this.heat.set(id,Math.max(0,h-dt*HUNTER_RULES.heatDecaySec));}
    if(this.enemy&&this.enemy.hp<=0){this.host.hunterDefeated(this.enemy);this.enemy=null;this.targetId=0;this.vehicleIds=[];return;}
    const eligible=[...agents.values()].filter(a=>a.hp>0&&!this.host.completed(a,'BOSS_D3_LT_CASSIA'));
    if(!this.enemy){
      const target=eligible.find(a=>getDistrictForPosition(a.position.x,a.position.z)===DistrictId.HELIOS_SPIRE&&(this.host.completed(a,'MISSION_D3_02')||(this.heat.get(a.entityId)??0)>=HUNTER_RULES.heatTrigger));
      if(!target)return;
      const spawned=this.host.spawnHunter({x:target.position.x+HUNTER_RULES.spawnDistanceM,y:target.position.y+HUNTER_RULES.altitudeM,z:target.position.z});
      this.enemy=spawned.enemy;this.vehicleIds=spawned.vehicleIds;this.targetId=target.entityId;
    }
    const target=agents.get(this.targetId);
    const next=target&&target.hp>0?target:eligible.sort((a,b)=>a.entityId-b.entityId)[0];
    if(!next)return;
    this.targetId=next.entityId;
    const goal={...next.position,y:next.position.y+ (this.enemy!.legsCrippledTimer>0?2:12)};
    this.host.moveHunter(this.enemy!,goal,dt);
    this.host.updateHunterVehicles(this.vehicleIds,this.enemy!,next,dt);
  }
}
