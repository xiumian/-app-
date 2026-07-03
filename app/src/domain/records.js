import { numericFromValue, offsetDateTime } from '../core/utils.js';

export function createCareRecord({ uid, petId, type, value, happenedAt, note }) {
  return {
    id: uid('c'),
    petId,
    type,
    value,
    numericValue: type === '体重' ? numericFromValue(value) : null,
    happenedAt: new Date(happenedAt || Date.now()).toISOString(),
    note,
    createdAt: new Date().toISOString()
  };
}

export function createWeightRecord({ uid, petId, weight, daysOffset }) {
  return {
    id: uid('c'),
    petId,
    type: '体重',
    value: `${weight}kg`,
    numericValue: weight,
    happenedAt: offsetDateTime(daysOffset),
    note: '',
    createdAt: new Date().toISOString()
  };
}
