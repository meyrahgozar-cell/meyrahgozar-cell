import { rpc } from './api.js';

export const getMe = () => rpc('app_me');
export const getPayments = () => rpc('app_my_payments');
export const getObligations = () => rpc('app_my_obligations');
export const getAllMembersScores = () => rpc('app_scoreboard');
export const saveSuggestion = (content) => rpc('app_submit_suggestion', { p_content: content });
