import type { MissionExecutionSpec, MissionArchetype } from '../content/missionArchetypeRegistry.js';
export interface MissionObservation { interacted:boolean;targetsRemaining:number;convoyStopped:boolean;atArchive:boolean;atExtraction:boolean;targetDefeated:boolean;defended:boolean;objectiveHp:number;participantsAlive:boolean }
export abstract class MissionArchetypeController {
  public state:'ACTIVE'|'COMPLETE'|'FAILED'='ACTIVE';
  public stage=0;public elapsed=0;public defenseElapsed=0;
  constructor(public readonly spec:MissionExecutionSpec){}
  public step(dt:number,o:MissionObservation):void {
    if(this.state!=='ACTIVE'||!Number.isFinite(dt)||dt<0)return;
    this.elapsed+=dt;
    if(!o.participantsAlive||this.elapsed>this.spec.durationSec||o.objectiveHp<=0){this.state='FAILED';return;}
    this.advance(dt,o);
  }
  protected abstract advance(dt:number,o:MissionObservation):void;
}
export class SabotageController extends MissionArchetypeController {
  protected advance(_dt:number,o:MissionObservation):void {if(o.targetsRemaining===0)this.state='COMPLETE';}
}
export class ConvoyInterceptController extends MissionArchetypeController {
  protected advance(_dt:number,o:MissionObservation):void {if(this.stage===0&&o.convoyStopped)this.stage=1;if(this.stage===1&&o.interacted&&o.targetsRemaining===0)this.state='COMPLETE';}
}
export class VerticalHeistController extends MissionArchetypeController {
  protected advance(_dt:number,o:MissionObservation):void {if(this.stage===0&&o.atArchive&&o.interacted)this.stage=1;else if(this.stage===1&&o.atExtraction&&o.interacted)this.state='COMPLETE';}
}
export class TurfDefenseController extends MissionArchetypeController {
  protected advance(dt:number,o:MissionObservation):void {if(o.defended)this.defenseElapsed+=dt;if(this.defenseElapsed>=this.spec.defenseSec&&o.targetsRemaining===0)this.state='COMPLETE';}
}
export class TargetHuntController extends MissionArchetypeController {
  protected advance(_dt:number,o:MissionObservation):void {if(o.targetDefeated)this.state='COMPLETE';}
}
export function createMissionController(spec:MissionExecutionSpec):MissionArchetypeController {
  const constructors:Record<MissionArchetype,new(spec:MissionExecutionSpec)=>MissionArchetypeController>={SABOTAGE:SabotageController,CONVOY_INTERCEPT:ConvoyInterceptController,VERTICAL_HEIST:VerticalHeistController,TURF_DEFENSE:TurfDefenseController,TARGET_HUNT:TargetHuntController};
  return new constructors[spec.archetype](spec);
}
