import React from 'react';
import { InfoSchema } from '../types';

export type InfoContextValue = {
  info: InfoSchema | null;
};

export const InfoContext = React.createContext<InfoContextValue>({ info: null });


