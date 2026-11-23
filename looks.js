// Looks: each is a set of curve points (0..1), split toning and small adjustments, blended by the strength slider.
export const LOOKS = [
  {id:'vivid',name:'Vivid',curve:[[0,0],[.25,.2],[.75,.82],[1,1]],saturation:.25,contrast:.08},
  {id:'clean',name:'Clean',curve:[[0,.02],[.5,.53],[1,1]],exposure:.03,saturation:.05,shadows:.12},
  {id:'golden',name:'Golden',curve:[[0,.03],[.5,.54],[1,.98]],r:[[0,0],[.5,.55],[1,1]],b:[[0,.02],[.5,.44],[1,.92]],warmth:.35,saturation:.08,hiTone:[.04,.025,-.02]},
  {id:'film',name:'Film',curve:[[0,.06],[.22,.2],[.75,.8],[1,.95]],g:[[0,.02],[1,.98]],b:[[0,.05],[1,.94]],saturation:-.08,grain:.25,fade:.05,shTone:[0,.02,.04],hiTone:[.03,.02,0]},
  {id:'teal',name:'Teal & Orange',curve:[[0,0],[.3,.26],[.7,.76],[1,1]],shTone:[-.05,.03,.07],hiTone:[.07,.03,-.04],saturation:.12,contrast:.06},
  {id:'moody',name:'Moody',curve:[[0,.05],[.35,.28],[.7,.68],[1,.92]],saturation:-.2,shTone:[0,.01,.03],exposure:-.06,vignette:.3},
  {id:'pastel',name:'Pastel',curve:[[0,.12],[.5,.6],[1,.98]],saturation:-.18,brightness:.12,hiTone:[.03,0,.04],fade:.2},
  {id:'dreamy',name:'Dreamy',curve:[[0,.08],[.5,.56],[1,1]],glow:.45,saturation:-.05,brightness:.1,hiTone:[.03,.01,.03]},
  {id:'crisp',name:'Crisp',curve:[[0,0],[.2,.15],[.8,.86],[1,1]],contrast:.12,saturation:.06,warmth:-.08},
  {id:'cool',name:'Cool',curve:[[0,.02],[1,1]],warmth:-.35,tint:-.05,saturation:.02,shTone:[-.02,0,.04]},
  {id:'warm',name:'Warm',curve:[[0,.02],[1,1]],warmth:.35,saturation:.05},
  {id:'forest',name:'Forest',curve:[[0,.03],[.5,.5],[1,.97]],g:[[0,0],[.5,.53],[1,1]],shTone:[-.02,.03,0],hiTone:[.03,.03,-.03],saturation:-.05},
  {id:'sunset',name:'Sunset',curve:[[0,.02],[.5,.52],[1,1]],r:[[0,.03],[.5,.58],[1,1]],b:[[0,.04],[.5,.45],[1,.9]],hiTone:[.08,.02,-.02],shTone:[.02,-.01,.05],saturation:.1},
  {id:'retro',name:'Retro',curve:[[0,.1],[.25,.25],[.75,.75],[1,.88]],r:[[0,.04],[1,.98]],b:[[0,.1],[1,.85]],saturation:-.15,grain:.35,vignette:.25},
  {id:'mono',name:'Mono',curve:[[0,0],[.25,.22],[.75,.8],[1,1]],mono:1},
  {id:'noir',name:'Noir',curve:[[0,0],[.3,.18],[.7,.84],[1,1]],mono:1,contrast:.2,vignette:.4,grain:.2},
  {id:'silver',name:'Silver',curve:[[0,.08],[.5,.55],[1,.96]],mono:1,fade:.15,hiTone:[.0,.01,.02]}
];
