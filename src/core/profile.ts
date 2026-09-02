import type { EducationEntry, Profile } from './types';

export const emptyEducation=():EducationEntry=>({school:'',college:'',major:'',education:'',enrollmentDate:'',graduationDate:''});
const educationKeys=(Object.keys(emptyEducation()) as (keyof EducationEntry)[]);

export function migrateLegacyEducation(profile:Profile):EducationEntry[]{
 if(profile.educations?.length)return profile.educations;
 const entry=emptyEducation();let found=false;
 for(const key of educationKeys){const value=profile[key];if(typeof value==='string'&&value){entry[key]=value;found=true;}}
 return found?[entry]:[emptyEducation()];
}
