export interface EnvironmentVariable {
    name: string;
    value: string;
    enabled: boolean;
}

export interface Environment {
    id: string;
    name: string;
    variables: EnvironmentVariable[];
    isActive: boolean;
    createdAt: number;
    updatedAt: number;
}

export function createEnvironment(name: string): Environment {
    const now = Date.now();
    return {
        id: generateId(),
        name,
        variables: [],
        isActive: false,
        createdAt: now,
        updatedAt: now,
    };
}

export function createVariable(name: string, value: string): EnvironmentVariable {
    return {
        name,
        value,
        enabled: true,
    };
}

function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
