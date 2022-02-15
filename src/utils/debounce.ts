interface Options {
    leading?: boolean
    trailing?: boolean
}

export function debounce<T extends (...args: any[]) => any>(
    fn: T,
    secs: number,
    { leading, trailing }: Options = { leading: false, trailing: true },
) {
    let timeoutId: NodeJS.Timeout

    if (leading) {
        let isWaiting = false
        return function (...args: Parameters<T>) {
            clearTimeout(timeoutId)

            if (!isWaiting) {
                isWaiting = true
                // @ts-ignore
                fn.apply(this, args)
            }

            timeoutId = setTimeout(() => {
                isWaiting = false
            }, secs * 1000)
        }
    }

    return function (...args: Parameters<T>) {
        clearTimeout(timeoutId)

        timeoutId = setTimeout(() => {
            // @ts-ignore
            fn.apply(this, args)
        }, secs * 1000)
    }
}
