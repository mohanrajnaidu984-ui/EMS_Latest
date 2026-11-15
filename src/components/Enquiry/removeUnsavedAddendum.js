export function removeUnsavedAddendum(addendums, pendingFiles, savedNumbers, number) {
    if (savedNumbers.includes(number)) return null;
    const removedFiles = pendingFiles.filter(file => file.addendumNo === number);
    const numbers = new Map();
    let next = Math.max(0, ...savedNumbers);
    const remaining = addendums.filter(a => a.AddendumNo !== number).map(a => {
        const updatedNumber = savedNumbers.includes(a.AddendumNo) ? a.AddendumNo : ++next;
        numbers.set(a.AddendumNo, updatedNumber);
        return { ...a, AddendumNo: updatedNumber };
    });
    return {
        addendums: remaining,
        pendingFiles: pendingFiles.filter(file => file.addendumNo !== number).map(file =>
            numbers.has(file.addendumNo) ? { ...file, addendumNo: numbers.get(file.addendumNo) } : file),
        removedFiles,
    };
}
