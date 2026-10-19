// Melbourne current wind from Open-Meteo (model "current" values, refreshed about every 15 minutes).
export const MELBOURNE={label:'Melbourne',latitude:-37.8136,longitude:144.9631};
export async function fetchJSON(url,fetcher=fetch) {
  const response=await fetcher(url,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error(`Weather service HTTP ${response.status}`);
  const data=await response.json();if(data.error)throw Error(String(data.reason||'Weather service error'));return data;
}
export function currentWindURL({latitude,longitude}=MELBOURNE) {
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw Error('Invalid coordinates');
  const url=new URL('https://api.open-meteo.com/v1/forecast');
  url.search=new URLSearchParams({latitude:latitude.toFixed(4),longitude:longitude.toFixed(4),current:'wind_speed_10m,wind_direction_10m,wind_gusts_10m',wind_speed_unit:'ms',timeformat:'unixtime',timezone:'Australia/Melbourne'});
  return url;
}
export function parseCurrentWind(data) {
  const c=data?.current,u=data?.current_units;
  if(!c||u?.wind_speed_10m!=='m/s')throw Error('Missing current wind or unexpected units');
  const values=[c.time,c.wind_speed_10m,c.wind_direction_10m,c.wind_gusts_10m];
  if(!values.every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Current wind contains missing values');
  if(c.wind_speed_10m<0||c.wind_gusts_10m<0||c.wind_direction_10m<0||c.wind_direction_10m>360)throw Error('Current wind outside expected range');
  return {time:c.time,speed:c.wind_speed_10m,gusts:c.wind_gusts_10m,from:c.wind_direction_10m%360};
}
// Wind blows FROM a compass bearing. Looking up at the canopy with north at the top, east is on the LEFT,
// so a compass bearing b maps to canvas angle 90 + b (counter-clockwise from +x).
export const compassToCanvas=(bearing,north=0)=>((90+bearing+north)%360+360)%360;
export const windToCanvas=(from,north=0)=>compassToCanvas(from+180,north);
