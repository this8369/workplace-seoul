import {test} from 'node:test';
import assert from 'node:assert/strict';
import {isEligible,toPyeong,filterBuildings,safeSourceUrl,type Building} from './domain.ts';
test('unrounded gross area threshold',()=>{assert.equal(isEligible(33057.85),false);assert.equal(isEligible(4000000/121),true);assert.equal(isEligible(33057.86),true);assert.equal(isEligible(NaN),false);assert.equal(toPyeong(400),121);});
test('combined search and favorites',()=>{const b={id:'a',name:'테스트 오피스',address:'서울',region:'CBD',status:'operating',gross_area_m2:40000} as Building; assert.equal(filterBuildings([b],' 테스트 ','CBD','operating',new Set(['a'])).length,1);assert.equal(filterBuildings([b],'','GBD','').length,0);assert.equal(filterBuildings([b],'','','',new Set()).length,0);assert.equal(filterBuildings([{...b,gross_area_m2:33057.85}],'','','').length,0);});
test('safe source links',()=>{assert.equal(safeSourceUrl('javascript:alert(1)'),undefined);assert.equal(safeSourceUrl('https://example.com'),'https://example.com/');});
