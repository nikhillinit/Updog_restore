import { useReducer } from 'react';

// Strongly typed modal system
export type ModalType = 'definition' | 'requestBuilder' | 'settings';

export interface ModalState {
  definition: boolean;
  requestBuilder: boolean;
  settings: boolean;
}

export type ModalAction =
  | { type: 'OPEN_MODAL'; modal: ModalType }
  | { type: 'CLOSE_MODAL'; modal: ModalType }
  | { type: 'CLOSE_ALL_MODALS' };

const modalReducer = (state: ModalState, action: ModalAction): ModalState => {
  switch (action.type) {
    case 'OPEN_MODAL':
      return { ...state, [action.modal]: true };
    case 'CLOSE_MODAL':
      return { ...state, [action.modal]: false };
    case 'CLOSE_ALL_MODALS':
      return { definition: false, requestBuilder: false, settings: false };
    default:
      return state;
  }
};

export const useModalState = () => {
  const [state, dispatch] = useReducer(modalReducer, {
    definition: false,
    requestBuilder: false,
    settings: false,
  });

  return {
    modalState: state,
    openModal: (modal: ModalType) => dispatch({ type: 'OPEN_MODAL', modal }),
    closeModal: (modal: ModalType) => dispatch({ type: 'CLOSE_MODAL', modal }),
    closeAllModals: () => dispatch({ type: 'CLOSE_ALL_MODALS' }),
  };
};
