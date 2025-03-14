import {
  parse,
  ObjectTypeDefinitionNode,
  Kind,
  TypeNode,
  DirectiveNode,
} from "graphql";
import * as fs from "fs";

// Type mapping from GraphQL to Ponder
const typeMapping = {
  ID: "text",
  String: "text",
  Int: "integer",
  BigInt: "bigint",
  Boolean: "boolean",
  Date: "date",
  foreignKey: "text",
  enum: "",
} as const;

function toCamelCase(str: string) {
  return str.charAt(0).toLowerCase() + str.slice(1);
}

interface TypeSpecs {
  type: (typeof typeMapping)[keyof typeof typeMapping];
  isPrimaryKey: boolean;
  isRequired: boolean;
  isList: boolean;
  isForeignKey: boolean;
  isEnum: boolean;
  foreignTable: string | null;
}

function inspectType(
  field: TypeNode,
  enums: EnumSpecs["enumName"][],
  specs: TypeSpecs = {
    type: "text",
    isPrimaryKey: false,
    isRequired: false,
    isList: false,
    isForeignKey: false,
    isEnum: false,
    foreignTable: null,
  }
) {
  if (field.kind === Kind.NAMED_TYPE) {
    const parsedValue = field.name.value;
    console.log(parsedValue, enums);
    const fieldType =
      parsedValue in typeMapping
        ? parsedValue
        : enums.includes(toCamelCase(parsedValue))
        ? "enum"
        : "foreignKey";
    specs.type = typeMapping[fieldType as keyof typeof typeMapping];
    if (fieldType === "ID") specs.isPrimaryKey = true;
    if (fieldType === "foreignKey") {
      specs.isForeignKey = true;
      specs.foreignTable = toCamelCase(parsedValue);
    }
    if (fieldType === "enum") {
      specs.isEnum = true;
      specs.isRequired = false;
      specs.foreignTable =
        parsedValue.charAt(0).toLowerCase() + parsedValue.slice(1);
    }
    return specs;
  }
  if (field.kind === Kind.LIST_TYPE) specs.isList = true;
  if (field.kind === Kind.NON_NULL_TYPE) specs.isRequired = true;
  return inspectType(field.type, enums, specs);
}

interface DirectiveSpecs {
  isIndex: boolean;
  isDerived: boolean;
  derivedField: string | null;
}

type FieldSpecs = { fieldName: string } & TypeSpecs & DirectiveSpecs;

function inspectDirectives(directives: ReadonlyArray<DirectiveNode>) {
  const specs: DirectiveSpecs = {
    isIndex: false,
    isDerived: false,
    derivedField: null,
  };
  for (const directive of directives) {
    if (directive.name.value === "index") specs.isIndex = true;
    if (directive.name.value === "derivedFrom") {
      if (!directive.arguments) continue;
      const argument = directive.arguments[0];
      if (!argument) continue;
      if (argument.value.kind !== Kind.STRING) continue;
      specs.isDerived = true;
      specs.derivedField = argument.value.value;
    }
  }
  return specs;
}

interface TableSpecs {
  tableName: string;
  fields: FieldSpecs[];
}

interface EnumSpecs {
  enumName: string;
  enumValues: string[];
}

function parseGraphQLSchema(
  schemaString: string
): [tebles: TableSpecs[], enums: EnumSpecs[]] {
  const schema = parse(schemaString);

  const enumDefs = schema.definitions.filter(
    (def) => def.kind === Kind.ENUM_TYPE_DEFINITION
  );
  //Handle enum types
  const enums: EnumSpecs[] = [];
  for (const enumDef of enumDefs) {
    const enumName = toCamelCase(enumDef.name.value);
    if (!enumDef.values) continue;
    const enumValues = enumDef.values.map((v) => v.name.value);
    enums.push({ enumName, enumValues });
  }

  const enumNames = enums.map((e) => e.enumName);

  const entities = schema.definitions.filter(
    (def) => def.kind === Kind.OBJECT_TYPE_DEFINITION
  );
  const tables: TableSpecs[] = [];
  for (const entity of entities) {
    const objectName = entity.name.value;
    const tableName = toCamelCase(objectName);

    const fields: FieldSpecs[] = [];
    if (entity.fields) {
      for (const field of entity.fields) {
        const typeSpecs = inspectType(field.type, enumNames);
        const directiveSpecs = inspectDirectives(field.directives ?? []);
        const fieldName =
          typeSpecs.isForeignKey && !directiveSpecs.isDerived
            ? `${field.name.value}Id`
            : field.name.value;

        fields.push({
          fieldName,
          ...typeSpecs,
          ...directiveSpecs,
        });
      }
    }

    tables.push({ tableName, fields });
  }
  return [tables, enums];
}

function generatePonderSchema(
  tables: TableSpecs[],
  enums: EnumSpecs[]
): string {
  let output = `import { onchainTable, onchainEnum, relations, index } from "ponder";\n\n`;

  // First generate all enums
  for (const enumDef of enums) {
    output += `export const ${enumDef.enumName} = onchainEnum(\n`;
    output += `  "${enumDef.enumName.toLowerCase()}",\n`;
    output += `  [${enumDef.enumValues.map((v) => `"${v}"`).join(", ")}],\n`;
    output += `);\n\n`;
  }

  // then generate all tables
  for (const table of tables) {
    output += `export const ${table.tableName} = onchainTable(\n`;
    output += `  "${table.tableName}",\n`;
    output += `  (t) => ({\n`;

    // Generate fields
    for (const field of table.fields) {
      // Skip derived fields
      if (field.isDerived) continue;
      if (field.isEnum) {
        output += `    ${field.fieldName}: ${field.foreignTable}("${field.foreignTable}"),\n`;
        continue;
      }

      // Generate field definition based on specs
      // first add t.type
      output += `    ${field.fieldName}: t`;
      if (field.type.length > 0) output += `.${field.type}()`;
      if (field.isRequired) output += `.notNull()`;
      if (field.isList && !field.isForeignKey) output += `.list()`;
      if (field.isPrimaryKey) output += `.primaryKey()`;
      output += `,\n`;
    }

    output += `  }),\n`;

    // Add indexes
    const indexedFields = table.fields.filter((field) => field.isIndex);
    if (indexedFields.length) {
      output += `  (table) => ({\n`;
      indexedFields.forEach((field) => {
        output += `    ${field.fieldName}Idx: index().on(table.${field.fieldName}),\n`;
      });
      output += `  })\n`;
    }

    output += `);\n\n`;
  }

  // Then generate all relationships
  for (const table of tables) {
    const oneRelationships = table.fields.filter(
      (f) => f.isForeignKey && !f.isDerived
    );
    const manyRelationships = table.fields.filter((f) => f.isDerived);
    console.log(
      `Table ${table.tableName} has ${oneRelationships.length} one relationships`
    );

    output += `export const ${table.tableName}Relations = relations(${table.tableName}, ({ one, many }) => ({\n`;

    // First handle all foreign keys (one relationships)
    for (const field of oneRelationships) {
      output += `  ${field.fieldName}: one(${field.foreignTable}, { `;
      output += `fields: [${table.tableName}.${field.fieldName}], `;
      output += `references: [${field.foreignTable}.id] }),\n`;
    }

    // Then handle all derived fields (many relationships)
    for (const field of manyRelationships) {
      output += `  ${field.fieldName}: many(${field.foreignTable}),\n`;
    }

    output += `}));\n\n`;
  }

  return output;
}

// Usage example
function convertSchemaFile(inputPath: string, outputPath: string) {
  const schemaContent = fs.readFileSync(inputPath, "utf-8");
  const [tables, enums] = parseGraphQLSchema(schemaContent);
  const ponderSchema = generatePonderSchema(tables, enums);
  fs.writeFileSync(outputPath, ponderSchema, { flag: "w" });
}

// Run the conversion
convertSchemaFile("schema.graphql", "ponder.schema.ts");
