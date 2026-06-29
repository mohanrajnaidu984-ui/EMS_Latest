export const findDOMNode = (component) => {
    return component?.current || component;
};
