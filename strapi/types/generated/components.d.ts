import type { Schema, Struct } from '@strapi/strapi';

export interface ArrayArray extends Struct.ComponentSchema {
  collectionName: 'components_array_arrays';
  info: {
    displayName: 'Array';
  };
  attributes: {
    NestedArray: Schema.Attribute.Component<'array.nested-array', true>;
    text: Schema.Attribute.String;
  };
}

export interface ArrayNestedArray extends Struct.ComponentSchema {
  collectionName: 'components_array_nested_arrays';
  info: {
    description: '';
    displayName: 'NestedArray';
  };
  attributes: {
    relationship_a: Schema.Attribute.Relation<
      'oneToOne',
      'api::relationship-a.relationship-a'
    >;
    text: Schema.Attribute.String;
  };
}

export interface DocumentHasManyRelations extends Struct.ComponentSchema {
  collectionName: 'components_document_has_many_relations';
  info: {
    displayName: 'hasManyRelations';
  };
  attributes: {
    relationship_as: Schema.Attribute.Relation<
      'oneToMany',
      'api::relationship-a.relationship-a'
    >;
    text: Schema.Attribute.String;
  };
}

export interface DocumentRelationToOne extends Struct.ComponentSchema {
  collectionName: 'components_document_relation_to_ones';
  info: {
    displayName: 'relationToOne';
  };
  attributes: {
    relationship_a: Schema.Attribute.Relation<
      'oneToOne',
      'api::relationship-a.relationship-a'
    >;
    text: Schema.Attribute.String;
  };
}

export interface GroupGroup extends Struct.ComponentSchema {
  collectionName: 'components_group_groups';
  info: {
    description: '';
    displayName: 'Group';
  };
  attributes: {
    NestedGroup: Schema.Attribute.Component<'group.nested-group', false>;
    text: Schema.Attribute.String;
  };
}

export interface GroupNestedGroup extends Struct.ComponentSchema {
  collectionName: 'components_group_nested_groups';
  info: {
    displayName: 'NestedGroup';
  };
  attributes: {
    text: Schema.Attribute.String;
  };
}

declare module '@strapi/strapi' {
  export module Public {
    export interface ComponentSchemas {
      'array.array': ArrayArray;
      'array.nested-array': ArrayNestedArray;
      'document.has-many-relations': DocumentHasManyRelations;
      'document.relation-to-one': DocumentRelationToOne;
      'group.group': GroupGroup;
      'group.nested-group': GroupNestedGroup;
    }
  }
}
